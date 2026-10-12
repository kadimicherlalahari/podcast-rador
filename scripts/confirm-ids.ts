// Writes IDs from scripts/confirmed-ids.json: [{ name, youtube_channel_id?, podcastindex_feed_id? }]
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db-core";
import { getChannelsByIds } from "../src/lib/youtube";
import { getFeedById } from "../src/lib/podcastindex";

type Entry = { name: string; youtube_channel_id?: string; podcastindex_feed_id?: number };

async function main() {
  const entries: Entry[] = JSON.parse(readFileSync("scripts/confirmed-ids.json", "utf8"));

  for (const e of entries) {
    const update: Record<string, unknown> = {};
    if (e.youtube_channel_id) {
      const ch = (await getChannelsByIds([e.youtube_channel_id]))[0];
      if (!ch?.uploadsPlaylistId) { console.log(`${e.name}: YouTube channel not found, skipped`); }
      else {
        update.youtube_channel_id = ch.channelId;
        update.youtube_uploads_playlist_id = ch.uploadsPlaylistId;
      }
    }
    if (e.podcastindex_feed_id) {
      const feed = await getFeedById(e.podcastindex_feed_id);
      if (!feed) { console.log(`${e.name}: feed not found, skipped`); }
      else {
        update.podcastindex_feed_id = feed.id;
        update.rss_url = feed.url;
        if (feed.language) update.language = feed.language;
      }
    }
    if (!Object.keys(update).length) continue;
    const cols = Object.keys(update);
    const res = await db().execute({
      sql: `update shows set ${cols.map((c) => `${c} = ?`).join(", ")} where name = ?`,
      args: [...cols.map((c) => update[c] as string | number), e.name],
    });
    console.log(`${e.name}: ${res.rowsAffected ? "updated " + cols.join(", ") : "no such show"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
