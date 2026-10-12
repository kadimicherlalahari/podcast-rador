// Phase 3 checkpoint: coverage, evidence-drop rate, and 10 random extracted episodes next to their source text.
// Usage: npm run report:extract [-- --samples 10]
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db-core";

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "–");

async function main() {
  const c = db();
  const samples = Number(process.argv[process.argv.indexOf("--samples") + 1]) || 10;
  const [cov] = (await c.execute(`
    select count(*) total,
      sum(exists(select 1 from appearances a where a.episode_id = e.id)) with_guest,
      sum(exists(select 1 from brand_mentions m where m.episode_id = e.id and m.mention_type != 'organic')) with_paid,
      sum(exists(select 1 from episode_topics t where t.episode_id = e.id)) with_topic
    from episodes e where e.status = 'extracted'`)).rows;
  const status = (await c.execute("select status, count(*) c from episodes where kind = 'full' group by 1")).rows;

  // Evidence-drop rate = items dropped for an unverifiable quote / all guest+brand items Gemini returned.
  const stats = (await c.execute("select extraction_stats s from episodes where status = 'extracted'")).rows;
  let returned = 0, evidenceDrops = 0, hostDrops = 0;
  for (const r of stats) {
    const s = JSON.parse(String(r.s ?? "{}"));
    returned += (s.raw?.guests?.length ?? 0) + (s.raw?.brands?.length ?? 0);
    for (const d of s.dropped ?? []) {
      if (d.reason === "evidence") evidenceDrops++;
      if (d.reason === "host") hostDrops++;
    }
  }

  const total = Number(cov.total);
  console.log("\nStatus of full episodes:", Object.fromEntries(status.map((r) => [r.status, r.c])));
  console.table({
    "extracted episodes": total,
    "≥1 guest": `${cov.with_guest} (${pct(Number(cov.with_guest), total)})`,
    "≥1 paid brand (ad read / sponsor)": `${cov.with_paid} (${pct(Number(cov.with_paid), total)})`,
    "≥1 topic": `${cov.with_topic} (${pct(Number(cov.with_topic), total)})`,
    "guest+brand items returned by Gemini": returned,
    "dropped: quote not in text": `${evidenceDrops} (${pct(evidenceDrops, returned)})`,
    "dropped: host listed as guest": hostDrops,
  });

  const per = (await c.execute(`
    select s.name show, count(e.id) eps,
      sum(exists(select 1 from appearances a where a.episode_id = e.id)) with_guest,
      sum(exists(select 1 from brand_mentions m where m.episode_id = e.id and m.mention_type != 'organic')) with_paid
    from episodes e join shows s on s.id = e.show_id where e.status = 'extracted' group by s.id order by s.name`)).rows;
  console.table(per.map((r) => ({ show: r.show, eps: r.eps, with_guest: r.with_guest, with_paid: r.with_paid })));

  const eps = (await c.execute({
    sql: `select e.id, e.title, e.description, e.extraction_stats, s.name show from episodes e join shows s on s.id = e.show_id
          where e.status = 'extracted' order by random() limit ?`,
    args: [samples],
  })).rows;
  for (const e of eps) {
    const id = String(e.id);
    const [g, b, t] = await Promise.all([
      c.execute({ sql: "select g.canonical_name n, g.company, a.evidence from appearances a join guests g on g.id = a.guest_id where a.episode_id = ?", args: [id] }),
      c.execute({ sql: "select b.canonical_name n, m.mention_type, m.evidence from brand_mentions m join brands b on b.id = m.brand_id where m.episode_id = ?", args: [id] }),
      c.execute({ sql: "select t.slug from episode_topics et join topics t on t.id = et.topic_id where et.episode_id = ?", args: [id] }),
    ]);
    const dropped = JSON.parse(String(e.extraction_stats ?? "{}")).dropped ?? [];
    console.log(`\n${"=".repeat(100)}\n[${e.show}] ${e.title}\n${"-".repeat(100)}`);
    console.log(`SOURCE (first 1200 chars):\n${String(e.description ?? "").slice(0, 1200).trim() || "(no description)"}\n${"-".repeat(100)}`);
    console.log("GUESTS:", g.rows.map((r) => `${r.n}${r.company ? ` (${r.company})` : ""}  ← "${r.evidence}"`).join("\n        ") || "–");
    console.log("BRANDS:", b.rows.map((r) => `${r.n} [${r.mention_type}]  ← "${r.evidence}"`).join("\n        ") || "–");
    console.log("TOPICS:", t.rows.map((r) => r.slug).join(", ") || "–");
    if (dropped.length) console.log("DROPPED:", dropped.map((d: { type: string; name: string; reason: string; evidence?: string }) => `${d.type} ${d.name} (${d.reason}) "${d.evidence ?? ""}"`).join("\n         "));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
