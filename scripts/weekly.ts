// The Monday schedule, run by hand: refresh (collect, extract, merge, research), then write and email the brief.
// Usage: npm run weekly [-- --refresh-only | --brief-only] [-- --force]
//   --force sends the brief even if one was emailed in the last 12 hours.
import { config } from "dotenv";
config({ path: ".env.local" });
import { weeklyBrief, weeklyRefresh } from "../src/lib/weekly";

async function main() {
  const args = process.argv.slice(2);
  const show = (r: { stage: string; ok: boolean; detail: string; ms: number }) =>
    console.log(`${r.ok ? "✓" : "✗"} ${r.stage.padEnd(18)} ${r.detail} (${Math.round(r.ms / 1000)}s)`);
  if (!args.includes("--brief-only")) for (const r of await weeklyRefresh(Infinity)) show(r);
  if (!args.includes("--refresh-only")) show(await weeklyBrief({ force: args.includes("--force") }));
}

main().catch((e) => { console.error(e); process.exit(1); });
