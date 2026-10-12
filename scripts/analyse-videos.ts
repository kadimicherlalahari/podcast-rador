// Gemini watches every extracted business episode that has no summary yet (first N minutes, see video_analysis_max_minutes).
// Usage: npm run analyse [-- --limit 20]
// Per-minute token limits: on a 429 it waits a minute and retries; a daily quota stop ends the run (rerun tomorrow).
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db-core";
import { RateLimitError } from "../src/lib/gemini";
import { analyseEpisode } from "../src/lib/insights";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const i = process.argv.indexOf("--limit");
  const limit = i > 0 ? Number(process.argv[i + 1]) : 1000;
  const minutes = Number((await db().execute("select value from scoring_config where key = 'video_analysis_max_minutes'")).rows[0]?.value ?? 40);
  const { rows } = await db().execute({
    sql: `select e.id, e.title, s.name show from episodes e join shows s on s.id = e.show_id
          where e.kind = 'full' and e.status = 'extracted' and e.business_related = 1 and e.youtube_video_id is not null
            and not exists (select 1 from insights i where i.entity_type = 'episode' and i.entity_id = e.id
                            and i.kind = 'analysis' and i.error is null)
          order by coalesce(e.view_count, 0) desc limit ?`,
    args: [limit],
  });
  console.log(`${rows.length} business episodes to watch (first ${minutes} min each)`);
  let done = 0, failed = 0;
  for (const r of rows) {
    for (let attempt = 1; ; attempt++) {
      try {
        await analyseEpisode(String(r.id), minutes);
        done++;
        console.log(`✓ ${done}/${rows.length} ${r.show}: ${String(r.title).slice(0, 70)}`);
        break;
      } catch (e) {
        const msg = (e as Error).message;
        if (e instanceof RateLimitError && /exhausted/.test(msg)) { console.log(`⏸ ${msg}. ${done} done; rerun later.`); return; }
        if (e instanceof RateLimitError && attempt < 4) { console.log("  … per-minute limit, waiting 60s"); await sleep(60_000); continue; }
        failed++;
        console.log(`✗ ${r.show}: ${String(r.title).slice(0, 60)} — ${msg.slice(0, 160)}`);
        break;
      }
    }
  }
  console.log(`\n${done} watched, ${failed} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
