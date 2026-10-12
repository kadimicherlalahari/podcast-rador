// Phase 4 checkpoint: entity merges, top media-rounds guests, topic momentum, top sponsors.
// Usage: npm run report:score [-- --resolve]   (--resolve runs entity resolution first)
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db-core";
import { resolveEntities } from "../src/lib/resolve";
import { computeScores } from "../src/lib/score";

async function main() {
  if (process.argv.includes("--resolve")) {
    const r = await resolveEntities({ log: (s) => console.log(s) });
    console.log(`\nresolve: ${r.candidates} candidates, ${r.merged} merged, ${r.keptDistinct} kept distinct, ${r.geminiCalls} Gemini calls, ${r.pending} pending`);
    for (const e of r.errors) console.log("  error:", e);
  }

  const merges = (await db().execute(
    "select entity_type, a_name, b_name, similarity, method, verdict, reason from entity_decisions order by created_at desc",
  )).rows;
  console.log("\nEntity decisions");
  console.table(merges.map((m) => ({ type: m.entity_type, a: m.a_name, b: m.b_name, sim: m.similarity, method: m.method, verdict: m.verdict, reason: String(m.reason ?? "").slice(0, 80) })));

  const s = await computeScores();
  console.log(`\nAs of ${s.asOf} (week of ${s.weekStart})`);
  console.log("\nMedia rounds (2+ shows, last 30 days)");
  console.table(s.mediaRounds.slice(0, 15).map((g) => ({ guest: g.name, company: g.company, shows: g.shows, appearances: g.appearances, last: g.lastSeen.slice(0, 10), on: [...new Set(g.episodes.map((e) => e.show))].join(", ") })));
  console.log(`\nEarly guests: ${s.earlyGuests.length} (newest 10)`);
  console.table(s.earlyGuests.slice(0, 10).map((g) => ({ guest: g.name, company: g.company, show: g.episodes[0]?.show, date: g.lastSeen.slice(0, 10) })));
  console.log("\nTopic momentum (this week vs avg of prior 4)");
  console.table(s.topics.map((t) => ({ topic: t.slug, this_week: t.thisWeek, prior_avg: t.priorAvg, ratio: t.ratio, trend: t.trend })));
  console.log("\nSponsors (paid reads + disclosures)");
  console.table(s.sponsors.slice(0, 15).map((b) => ({ brand: b.name, score: b.score, shows: b.shows, placements: b.placements, last: b.lastSeen.slice(0, 10) })));
}

main().catch((e) => { console.error(e); process.exit(1); });
