import type { InStatement } from "@libsql/client";
import { db } from "./db-core";
import { comparePair, pairKey, type EntityType } from "./entities";
import { generateJson, RateLimitError } from "./gemini";

type Entity = { id: string; key: string; name: string; refs: number; context: string };
type Candidate = { type: EntityType; a: Entity; b: Entity; similarity: number; method: "levenshtein" | "gemini"; reason?: string };
export type ResolveSummary = {
  candidates: number; merged: number; keptDistinct: number; geminiCalls: number; pending: number;
  merges: string[]; errors: string[];
};

const TABLE = { guest: "guests", brand: "brands" } as const;

/** alias key → canonical key, for mapping freshly extracted names onto merged entities. */
export async function loadAliases(): Promise<Record<EntityType, Map<string, string>>> {
  const { rows } = await db().execute("select entity_type, alias_key, canonical_key from entity_aliases");
  const out = { guest: new Map<string, string>(), brand: new Map<string, string>() };
  for (const r of rows) out[r.entity_type as EntityType].set(String(r.alias_key), String(r.canonical_key));
  return out;
}

async function loadEntities(type: EntityType): Promise<Entity[]> {
  // Context for the Gemini check: company/role or how the brand was mentioned, the shows, and a couple of quotes.
  const sql = type === "guest"
    ? `select g.id, g.normalized_key key, g.canonical_name name, count(a.id) refs,
         coalesce(g.company, '') || case when g.role is not null and g.role != '' then ' · ' || g.role else '' end detail,
         group_concat(distinct s.name) shows, (select group_concat(evidence, ' | ') from
           (select evidence from appearances where guest_id = g.id limit 2)) quotes
       from guests g left join appearances a on a.guest_id = g.id
         left join episodes e on e.id = a.episode_id left join shows s on s.id = e.show_id
       group by g.id`
    : `select b.id, b.normalized_key key, b.canonical_name name, count(m.id) refs,
         group_concat(distinct m.mention_type) detail,
         group_concat(distinct s.name) shows, (select group_concat(evidence, ' | ') from
           (select evidence from brand_mentions where brand_id = b.id limit 2)) quotes
       from brands b left join brand_mentions m on m.brand_id = b.id
         left join episodes e on e.id = m.episode_id left join shows s on s.id = e.show_id
       group by b.id`;
  const { rows } = await db().execute(sql);
  return rows.map((r) => ({
    id: String(r.id), key: String(r.key), name: String(r.name), refs: Number(r.refs),
    context: [r.detail && `details: ${r.detail}`, r.shows && `shows: ${r.shows}`, r.quotes && `quotes: ${r.quotes}`]
      .filter(Boolean).join("; ") || "no other context",
  }));
}

const SYSTEM = `You decide whether two names extracted from Indian podcast episode descriptions refer to the same real-world entity.
Answer same=true only if you are confident they are the same person (for guests) or the same company/brand (for brands).
A company's separate product, fund, foundation, show or channel is NOT the same as the company, unless the context shows the two names are used for one sponsor or one entity.
Two different people who share a first name or surname are NOT the same. Give a one-sentence reason.`;

async function askSame(type: EntityType, a: Entity, b: Entity, onAttempt: () => void): Promise<{ same: boolean; reason: string }> {
  return generateJson<{ same: boolean; reason: string }>({
    system: SYSTEM,
    prompt: `Entity type: ${type === "guest" ? "person (podcast guest)" : "company or brand"}\n\nA: "${a.name}" (${a.context})\n\nB: "${b.name}" (${b.context})`,
    schema: {
      type: "object",
      properties: { same: { type: "boolean" }, reason: { type: "string" } },
      required: ["same", "reason"],
    },
    retries: 2,
    onAttempt,
  });
}

function decisionStmt(c: Candidate, verdict: "merged" | "distinct"): InStatement {
  const [x, y] = pairKey(c.a.key, c.b.key);
  const [xn, yn] = x === c.a.key ? [c.a.name, c.b.name] : [c.b.name, c.a.name];
  return {
    sql: `insert or ignore into entity_decisions (entity_type, a_key, b_key, a_name, b_name, similarity, method, verdict, reason)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [c.type, x, y, xn, yn, c.similarity, c.method, verdict, c.reason ?? null],
  };
}

/** Moves every reference from `lose` onto `keep`, records the alias, and deletes `lose`. */
function mergeStatements(type: EntityType, keep: Entity, lose: Entity): InStatement[] {
  const t = TABLE[type];
  const refs: InStatement[] = type === "guest"
    ? [
        { sql: "insert or ignore into appearances (episode_id, guest_id, evidence) select episode_id, ?, evidence from appearances where guest_id = ?", args: [keep.id, lose.id] },
        { sql: "delete from appearances where guest_id = ?", args: [lose.id] },
        { sql: "update guests set company = coalesce(company, (select company from guests where id = ?)), role = coalesce(role, (select role from guests where id = ?)) where id = ?", args: [lose.id, lose.id, keep.id] },
      ]
    : [
        { sql: "insert or ignore into brand_mentions (episode_id, brand_id, mention_type, evidence) select episode_id, ?, mention_type, evidence from brand_mentions where brand_id = ?", args: [keep.id, lose.id] },
        { sql: "delete from brand_mentions where brand_id = ?", args: [lose.id] },
      ];
  return [
    ...refs,
    { sql: "update or ignore pipeline set entity_id = ? where entity_type = ? and entity_id = ?", args: [keep.id, type, lose.id] },
    { sql: "delete from pipeline where entity_type = ? and entity_id = ?", args: [type, lose.id] },
    { sql: "update enrichments set entity_id = ? where entity_type = ? and entity_id = ?", args: [keep.id, type, lose.id] },
    { sql: `update ${t} set aliases = json_insert(aliases, '$[#]', ?) where id = ?`, args: [lose.name, keep.id] },
    { sql: "update entity_aliases set canonical_key = ? where entity_type = ? and canonical_key = ?", args: [keep.key, type, lose.key] },
    { sql: "insert or replace into entity_aliases (entity_type, alias_key, canonical_key) values (?, ?, ?)", args: [type, lose.key, keep.key] },
    { sql: `delete from ${t} where id = ?`, args: [lose.id] },
  ];
}

/**
 * Stage 4. Compares every pair of guests (and of brands) once: near-identical names merge automatically,
 * borderline ones are checked by Gemini (capped per run), and every decision is logged in entity_decisions.
 * Pairs Gemini couldn't check (cap, deadline, rate limit) stay pending for the next run.
 */
export async function resolveEntities(opts: { maxCalls?: number; deadlineMs?: number; log?: (s: string) => void } = {}): Promise<ResolveSummary> {
  const c = db();
  const started = new Date().toISOString();
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const cfg = (await c.execute("select value from scoring_config where key = 'resolve_gemini_max_calls'")).rows[0];
  const maxCalls = opts.maxCalls ?? Number(cfg?.value ?? 30);
  const decided = new Set((await c.execute("select entity_type, a_key, b_key from entity_decisions")).rows
    .map((r) => `${r.entity_type}:${r.a_key}:${r.b_key}`));
  const sum: ResolveSummary = { candidates: 0, merged: 0, keptDistinct: 0, geminiCalls: 0, pending: 0, merges: [], errors: [] };

  for (const type of ["guest", "brand"] as const) {
    const ents = await loadEntities(type);
    const auto: Candidate[] = [];
    const ask: Candidate[] = [];
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const [x, y] = pairKey(ents[i].key, ents[j].key);
        if (decided.has(`${type}:${x}:${y}`)) continue;
        const { verdict, similarity } = comparePair(ents[i].key, ents[j].key, type);
        if (verdict === "different") continue;
        (verdict === "same" ? auto : ask).push({ type, a: ents[i], b: ents[j], similarity, method: verdict === "same" ? "levenshtein" : "gemini" });
      }
    }
    sum.candidates += auto.length + ask.length;

    // Gemini checks run a few at a time; merges are applied afterwards so they don't depend on call order.
    const yes: Candidate[] = [];
    const logs: InStatement[] = [];
    let next = 0;
    let stopped = false;
    async function worker() {
      while (!stopped && next < ask.length) {
        if (sum.geminiCalls >= maxCalls || Date.now() > deadline) { stopped = true; return; }
        const cand = ask[next++];
        try {
          const r = await askSame(type, cand.a, cand.b, () => { sum.geminiCalls++; });
          cand.reason = r.reason;
          if (r.same) yes.push(cand);
          else { logs.push(decisionStmt(cand, "distinct")); sum.keptDistinct++; }
          opts.log?.(`${r.same ? "=" : "≠"} ${cand.a.name} / ${cand.b.name}: ${r.reason}`);
        } catch (e) {
          sum.errors.push(`${cand.a.name} / ${cand.b.name}: ${(e as Error).message.slice(0, 200)}`);
          if (e instanceof RateLimitError) stopped = true;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, ask.length) }, worker));
    sum.pending += ask.filter((a) => !a.reason).length;

    // Union-find: each group of matching names collapses into its most-referenced entity (ties: the longer name).
    const parent = new Map<string, Entity>();
    const find = (e: Entity): Entity => { const p = parent.get(e.id); return p ? find(p) : e; };
    const better = (a: Entity, b: Entity) => (a.refs !== b.refs ? a.refs > b.refs : a.name.length >= b.name.length);
    const stmts: InStatement[] = [...logs];
    for (const cand of [...auto, ...yes]) {
      const ra = find(cand.a), rb = find(cand.b);
      stmts.push(decisionStmt(cand, "merged"));
      if (ra.id === rb.id) continue;
      const [keep, lose] = better(ra, rb) ? [ra, rb] : [rb, ra];
      parent.set(lose.id, keep);
      keep.refs += lose.refs;
      stmts.push(...mergeStatements(type, keep, lose));
      sum.merged++;
      sum.merges.push(`${type}: "${lose.name}" → "${keep.name}" (${cand.method}${cand.reason ? `: ${cand.reason}` : ""})`);
      opts.log?.(`merge ${type}: ${lose.name} → ${keep.name}`);
    }
    if (stmts.length) await c.batch(stmts, "write");
  }

  await c.execute({
    sql: `insert into resolve_runs (started_at, finished_at, candidates, merged, kept_distinct, gemini_calls, pending, errors)
          values (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [started, new Date().toISOString(), sum.candidates, sum.merged, sum.keptDistinct, sum.geminiCalls, sum.pending, JSON.stringify(sum.errors)],
  });
  return sum;
}
