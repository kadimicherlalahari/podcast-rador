// One-off: host names (excluded from guest lists) and pausing unresolved shows.
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db-core";

const hosts: Record<string, string[]> = {
  "The Neon Show": ["Siddhartha Ahluwalia"],
  "WTF is with Nikhil Kamath": ["Nikhil Kamath"],
  "The BarberShop with Shantanu": ["Shantanu Deshpande"],
  "Founder Thesis": ["Akshay Datt"],
  "Figuring Out": ["Raj Shamani"],
  "The Ranveer Show": ["Ranveer Allahbadia"],
  "Raw Talks With Vamshi Kurapati": ["Vamshi Kurapati"],
  "SparX": ["Mukesh Bansal"],
};

async function main() {
  for (const [name, h] of Object.entries(hosts))
    await db().execute({ sql: "update shows set host_names = ? where name = ?", args: [JSON.stringify(h), name] });
  await db().execute("update shows set active = 0 where name in ('First Principles', 'The Indian Dream')");
  const r = await db().execute("select name, active, youtube_channel_id, youtube_uploads_playlist_id, podcastindex_feed_id, language, host_names, rss_url from shows order by name");
  console.table(r.rows.map((x) => ({ ...x })));
}
main();
