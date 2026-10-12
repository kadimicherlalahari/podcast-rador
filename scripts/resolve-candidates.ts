// Read-only: prints top candidates for shows missing IDs. Never writes to the DB.
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db-core";
import { searchChannels } from "../src/lib/youtube";
import { searchFeeds } from "../src/lib/podcastindex";

async function main() {
  const { rows } = await db().execute("select * from shows order by name");
  for (const s of rows) {
    const name = String(s.name);
    const needYt = !s.youtube_channel_id;
    const needRss = !s.podcastindex_feed_id;
    if (!needYt && !needRss) continue;
    console.log(`\n=== ${name} ===`);
    if (needYt) {
      try {
        const c = await searchChannels(name, 3);
        console.log("YouTube:");
        console.table(c.map((x) => ({ channelId: x.channelId, title: x.title, handle: x.handle, subs: x.subscriberCount })));
      } catch (e) { console.log("YouTube error:", (e as Error).message); }
    }
    if (needRss) {
      try {
        const f = await searchFeeds(name, 3);
        console.log("Podcast Index:");
        console.table(f.map((x) => ({
          feedId: x.id, title: x.title, author: x.author, eps: x.episodeCount, lang: x.language,
          last: x.lastUpdateTime ? new Date(x.lastUpdateTime * 1000).toISOString().slice(0, 10) : "", url: x.url,
        })));
      } catch (e) { console.log("Podcast Index error:", (e as Error).message); }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
