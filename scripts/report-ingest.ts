import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db-core";

async function main() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { rows } = await db().execute({
    sql: `select s.name show,
            count(e.id) total,
            sum(e.kind = 'full') full_eps,
            sum(e.kind = 'clip') clips,
            sum(e.kind = 'trailer') trailers,
            sum(e.kind = 'live_upcoming') live,
            sum(e.youtube_video_id is not null and e.rss_guid is not null) matched,
            sum(e.kind = 'full' and e.published_at >= ?) full_30d,
            sum(e.youtube_video_id is not null and e.rss_guid is null) yt_only,
            sum(e.youtube_video_id is null and e.rss_guid is not null) rss_only
          from shows s left join episodes e on e.show_id = s.id
          where s.active = 1 group by s.id order by s.name`,
    args: [since],
  });
  console.table(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => isNaN(Number(k))).map(([k, v]) => [k, v ?? 0]))));
}

main().catch((e) => { console.error(e); process.exit(1); });
