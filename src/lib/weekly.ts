import { db } from "./db-core";
import { buildBrief, emailBrief } from "./brief";
import { extractBatch } from "./extract";
import { ingestAll } from "./ingest";
import { runInsights } from "./insights";
import { resolveEntities } from "./resolve";

/**
 * The Monday schedule (IST): 07:00 refresh, 08:00 brief. Kept as two jobs so the email goes out on time even
 * if research runs long, and so each fits one function invocation. Every stage is time-boxed from a shared
 * budget; anything unfinished is picked up by the next run.
 */

export type StageResult = { stage: string; ok: boolean; detail: string; ms: number };

async function timed(stage: string, fn: () => Promise<string>): Promise<StageResult> {
  const t = Date.now();
  try {
    return { stage, ok: true, detail: await fn(), ms: Date.now() - t };
  } catch (e) {
    // One stage failing never stops the rest: a stale ranking still beats no brief.
    return { stage, ok: false, detail: (e as Error).message.slice(0, 300), ms: Date.now() - t };
  }
}

/** Collect → extract → merge names → stats and research, within `budgetMs`. */
export async function weeklyRefresh(budgetMs = 270_000): Promise<StageResult[]> {
  const end = Date.now() + budgetMs;
  const left = (reserve = 0) => Math.max(10_000, end - Date.now() - reserve);
  const out: StageResult[] = [];
  out.push(await timed("collect", async () => {
    const r = await ingestAll({ youtubeMaxPages: 1 });
    const n = Object.values(r.perShow).reduce((s, x) => s + x.inserted, 0);
    if (r.errors.length) throw new Error(r.errors.slice(0, 3).join("; "));
    return `${n} new items from ${Object.keys(r.perShow).length} channels`;
  }));
  out.push(await timed("extract", async () => {
    const r = await extractBatch({ deadlineMs: left(150_000) });
    return `${r.extracted} extracted, ${r.failed} failed, ${r.remaining} waiting (${r.stopReason})`;
  }));
  out.push(await timed("merge names", async () => {
    const r = await resolveEntities({ deadlineMs: left(120_000) });
    return `${r.merged} merged, ${r.pending} pending`;
  }));
  out.push(await timed("stats and research", async () => {
    const r = await runInsights({ deadlineMs: left(15_000) });
    return `${r.statsUpdated} stats, ${r.commentsFetched} comments, ${r.generated} research items (${r.stopReason})`;
  }));
  return out;
}

/**
 * Writes and emails the brief. Skips when a brief was already emailed in the last 12 hours, so a retried
 * or duplicated trigger never sends the founder two emails; `force` overrides that for manual sends.
 */
export async function weeklyBrief(opts: { force?: boolean } = {}): Promise<StageResult & { skipped?: boolean }> {
  if (!opts.force) {
    const recent = (await db().execute(
      "select generated_at from briefs where emailed = 1 and generated_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 hours') order by generated_at desc limit 1",
    )).rows[0];
    if (recent) return { stage: "brief", ok: true, skipped: true, detail: `Already emailed at ${recent.generated_at}; not sending again`, ms: 0 };
  }
  return timed("brief", async () => {
    const { id, data } = await buildBrief();
    const sent = await emailBrief(id);
    const drafts = data.guests.filter((g) => g.draft.body).length + data.brands.filter((b) => b.draft.body).length;
    return `Brief ${id} with ${drafts} drafts emailed to ${sent.to}`;
  });
}
