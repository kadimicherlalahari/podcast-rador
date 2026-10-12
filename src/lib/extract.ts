import type { InStatement } from "@libsql/client";
import { db } from "./db-core";
import { verifyExtraction, type Dropped, type RawExtraction, type Verified } from "./evidence";
import { generateJson, geminiModel, RateLimitError } from "./gemini";

type Topic = { slug: string; label: string };
type Pending = { id: string; title: string; description: string; showName: string; hostNames: string[] };
export type ExtractSummary = {
  processed: number; extracted: number; failed: number; geminiCalls: number;
  kept: { guests: number; brands: number; paid_brands: number; topics: number };
  dropped: Record<Dropped["reason"], number>;
  stopReason: "done" | "batch_limit" | "call_cap" | "deadline" | "rate_limited";
  errors: string[];
  remaining: number;
};

const SYSTEM = `You extract structured facts from podcast episode metadata (title + description) for an Indian startup-podcast intelligence tool.

Rules:
- guests: people interviewed in THIS episode. Never include the show's hosts. Never include people who are only mentioned, quoted, thanked, or credited (editors, producers, music).
  Use the person's full name as written. company/role only if the text states them, else "".
- topics: 1-4 slugs from the provided taxonomy that describe what the conversation is mainly about. Use "other" only if nothing fits.
- brands: companies or products named in the text.
  mention_type = "paid_read" when the text is an ad read for a third-party brand: promo/discount codes, "use code", "get X% off",
    "download <brand>", "check out <brand>" with a link, sponsor-style calls to action.
  mention_type = "sponsor_disclosure" when the text explicitly discloses sponsorship ("sponsored by", "brought to you by",
    "in partnership with", "#ad", "paid partnership", "presenting sponsor", "thanks to our sponsor").
  Pick ONE of the two for a brand, never both.
  Everything else is "organic", including:
  - the guest's companies and anything discussed in the conversation;
  - the show's own products, even when promoted: its channels, social links, merch, courses, communities, newsletters,
    and anything the host promotes as their own ("my app", "our course", "join our community");
  - production/crew credits ("produced by", "powered by", "edited by", studios, agencies);
  - payment/support platforms named for help ("for payment issues write to ...");
  - retailers or marketplaces that merely host another brand's link (the sponsor is the brand, not Flipkart/Amazon);
  - gear/equipment lists ("Camera -", "Mic -") and book or reading recommendations, even with affiliate links.
- evidence: copy a short EXACT substring (3-150 characters) from the input text that supports the item, character for character. Do not paraphrase, translate, or fix typos. If you cannot quote it, leave the item out.
- If the description is empty or uninformative, rely on the title only. Returning empty lists is fine.`;

function schema(slugs: string[]) {
  const str = { type: "string" };
  return {
    type: "object",
    properties: {
      guests: {
        type: "array",
        items: { type: "object", properties: { name: str, company: str, role: str, evidence: str }, required: ["name", "company", "role", "evidence"] },
      },
      topics: { type: "array", items: { type: "string", enum: slugs } },
      brands: {
        type: "array",
        items: {
          type: "object",
          properties: { name: str, mention_type: { type: "string", enum: ["paid_read", "sponsor_disclosure", "organic"] }, evidence: str },
          required: ["name", "mention_type", "evidence"],
        },
      },
    },
    required: ["guests", "topics", "brands"],
  };
}

/** The exact text Gemini sees, and that evidence is verified against. */
export function sourceText(ep: { title: string; description: string }): string {
  return `Title: ${ep.title}\n\nDescription:\n${ep.description || "(none)"}`;
}

function prompt(ep: Pending, topics: Topic[]): string {
  return [
    `Show: ${ep.showName}`,
    `Hosts (never guests): ${ep.hostNames.join(", ") || "unknown"}`,
    `Topic taxonomy:\n${topics.map((t) => `- ${t.slug}: ${t.label}`).join("\n")}`,
    `--- INPUT TEXT ---\n${sourceText(ep)}`,
  ].join("\n\n");
}

export async function loadExtractCfg() {
  const { rows } = await db().execute("select key, value from scoring_config where key in ('extract_batch_size','gemini_max_calls_per_run')");
  const m = Object.fromEntries(rows.map((r) => [String(r.key), Number(r.value)]));
  return { batchSize: m.extract_batch_size ?? 15, maxCalls: m.gemini_max_calls_per_run ?? 40 };
}

function writeStatements(ep: Pending, v: Verified, raw: RawExtraction, calls: number): InStatement[] {
  const s: InStatement[] = [
    // Re-extraction replaces earlier results for this episode; entities themselves are kept.
    { sql: "delete from appearances where episode_id = ?", args: [ep.id] },
    { sql: "delete from brand_mentions where episode_id = ?", args: [ep.id] },
    { sql: "delete from episode_topics where episode_id = ?", args: [ep.id] },
  ];
  for (const g of v.guests) {
    s.push({
      sql: `insert into guests (canonical_name, normalized_key, company, role) values (?, ?, ?, ?)
            on conflict(normalized_key) do update set company = coalesce(guests.company, excluded.company),
              role = coalesce(guests.role, excluded.role)`,
      args: [g.name, g.key, g.company, g.role],
    });
    s.push({
      sql: "insert or ignore into appearances (episode_id, guest_id, evidence) select ?, id, ? from guests where normalized_key = ?",
      args: [ep.id, g.evidence, g.key],
    });
  }
  for (const b of v.brands) {
    s.push({ sql: "insert or ignore into brands (canonical_name, normalized_key) values (?, ?)", args: [b.name, b.key] });
    s.push({
      sql: `insert or ignore into brand_mentions (episode_id, brand_id, mention_type, evidence)
            select ?, id, ?, ? from brands where normalized_key = ?`,
      args: [ep.id, b.mention_type, b.evidence, b.key],
    });
  }
  for (const t of v.topics) {
    s.push({ sql: "insert or ignore into episode_topics (episode_id, topic_id) select ?, id from topics where slug = ?", args: [ep.id, t] });
  }
  s.push({
    sql: `update episodes set status = 'extracted', extraction_error = null,
            extracted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), extraction_stats = ? where id = ?`,
    args: [JSON.stringify({ model: geminiModel(), calls, dropped: v.dropped, raw }), ep.id],
  });
  return s;
}

/**
 * Stage 3. Extracts up to `limit` pending full episodes, one Gemini call each, `concurrency` at a time (default 3).
 * Stops early at the per-run Gemini call cap, the deadline, or a persistent 429 (episodes stay pending).
 */
export async function extractBatch(opts: {
  limit?: number; maxCalls?: number; deadlineMs?: number; concurrency?: number; log?: (s: string) => void;
} = {}): Promise<ExtractSummary> {
  const c = db();
  const cfg = await loadExtractCfg();
  const limit = opts.limit ?? cfg.batchSize;
  const maxCalls = opts.maxCalls ?? cfg.maxCalls;
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const started = new Date().toISOString();

  const topics = (await c.execute("select slug, label from topics order by slug = 'other', slug")).rows
    .map((r) => ({ slug: String(r.slug), label: String(r.label) }));
  const slugs = topics.map((t) => t.slug);
  const { rows } = await c.execute({
    sql: `select e.id, e.title, e.description, s.name show_name, s.host_names from episodes e join shows s on s.id = e.show_id
          where e.status = 'pending_extraction' and e.kind = 'full' order by e.published_at desc limit ?`,
    args: [limit],
  });
  const pending: Pending[] = rows.map((r) => ({
    id: String(r.id), title: String(r.title), description: String(r.description ?? ""),
    showName: String(r.show_name), hostNames: JSON.parse(String(r.host_names ?? "[]")),
  }));

  const sum: ExtractSummary = {
    processed: 0, extracted: 0, failed: 0, geminiCalls: 0,
    kept: { guests: 0, brands: 0, paid_brands: 0, topics: 0 },
    dropped: { evidence: 0, host: 0, self: 0, taxonomy: 0, empty: 0 },
    stopReason: rows.length < limit ? "done" : "batch_limit", errors: [], remaining: 0,
  };

  // A few episodes in flight at once: each Gemini call takes ~30-40s, mostly model thinking time.
  let next = 0;
  let stopped = false;
  const stop = (reason: ExtractSummary["stopReason"]) => { if (!stopped) { stopped = true; sum.stopReason = reason; } };
  async function worker() {
    while (!stopped && next < pending.length) {
      if (sum.geminiCalls >= maxCalls) return stop("call_cap");
      if (Date.now() > deadline) return stop("deadline");
      const ep = pending[next++];
      let calls = 0;
      try {
        const raw = await generateJson<RawExtraction>({
          system: SYSTEM, prompt: prompt(ep, topics), schema: schema(slugs),
          onAttempt: () => { calls++; sum.geminiCalls++; },
          retries: Math.max(0, Math.min(5, maxCalls - sum.geminiCalls)),
          onRetry: (status, ms) => opts.log?.(`  … Gemini ${status}, retrying in ${Math.round(ms / 1000)}s`),
        });
        const v = verifyExtraction(raw, sourceText(ep), ep.hostNames, slugs, ep.showName);
        await c.batch(writeStatements(ep, v, raw, calls), "write");
        sum.processed++;
        sum.extracted++;
        sum.kept.guests += v.guests.length;
        sum.kept.brands += v.brands.length;
        sum.kept.paid_brands += v.brands.filter((b) => b.mention_type !== "organic").length;
        sum.kept.topics += v.topics.length;
        for (const d of v.dropped) sum.dropped[d.reason]++;
        opts.log?.(`✓ ${ep.showName}: ${ep.title.slice(0, 60)} — ${v.guests.length} guests, ${v.brands.length} brands, ${v.topics.length} topics, ${v.dropped.length} dropped`);
      } catch (e) {
        const msg = (e as Error).message;
        if (e instanceof RateLimitError) {
          // Episode stays pending; the next run picks it up.
          sum.errors.push(msg);
          opts.log?.(`⏸ ${msg}`);
          return stop("rate_limited");
        }
        sum.processed++;
        sum.failed++;
        sum.errors.push(`${ep.showName} "${ep.title.slice(0, 40)}": ${msg}`);
        await c.execute({
          sql: "update episodes set status = 'failed', extraction_error = ?, extraction_stats = ? where id = ?",
          args: [msg.slice(0, 500), JSON.stringify({ model: geminiModel(), calls }), ep.id],
        });
        opts.log?.(`✗ ${ep.showName}: ${ep.title.slice(0, 60)} — ${msg}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, pending.length) }, worker));

  sum.remaining = Number((await c.execute(
    "select count(*) c from episodes where status = 'pending_extraction' and kind = 'full'",
  )).rows[0].c);
  if (sum.stopReason === "batch_limit" && sum.remaining === 0) sum.stopReason = "done";
  await c.execute({
    sql: `insert into extract_runs (started_at, finished_at, processed, extracted, failed, gemini_calls, kept, dropped, stop_reason, errors)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [started, new Date().toISOString(), sum.processed, sum.extracted, sum.failed, sum.geminiCalls,
      JSON.stringify(sum.kept), JSON.stringify(sum.dropped), sum.stopReason, JSON.stringify(sum.errors)],
  });
  return sum;
}

/** Puts failed episodes back in the queue so the next run retries them. */
export async function requeueFailed(): Promise<number> {
  const r = await db().execute("update episodes set status = 'pending_extraction' where status = 'failed' and kind = 'full'");
  return r.rowsAffected;
}
