"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ingestShow, loadCfg } from "@/lib/ingest";
import { getChannelsByIds, resolveChannelInput, type YtCandidate } from "@/lib/youtube";

export type FindState =
  | { status: "idle" }
  | { status: "found"; channel: YtCandidate; tracked: "active" | "removed" | null }
  | { status: "error"; message: string };

const refresh = () => { revalidatePath("/"); revalidatePath("/admin/shows"); revalidatePath("/rankings"); };

/** Looks a channel up by URL, @handle or channel ID. Nothing is saved until the founder confirms with addChannel. */
export async function findChannel(_prev: FindState, f: FormData): Promise<FindState> {
  const q = String(f.get("q") ?? "").trim();
  if (!q) return { status: "error", message: "Paste a YouTube channel link, @handle or channel ID." };
  if (/youtube\.com\/(watch|shorts|live)|youtu\.be\//.test(q)) {
    return { status: "error", message: "That's a video link. Paste the channel's link instead (it looks like youtube.com/@name)." };
  }
  try {
    const bare = /^[\w.\-]+$/.test(q) && !/^UC[\w-]{20,}$/.test(q) ? `@${q}` : q; // "rajshamani" → "@rajshamani"
    const channel = await resolveChannelInput(bare);
    if (!channel) return { status: "error", message: "No channel found. Check the link, or copy it from the channel's page." };
    const row = (await db().execute({ sql: "select active from shows where youtube_channel_id = ?", args: [channel.channelId] })).rows[0];
    return { status: "found", channel, tracked: row ? (row.active === 1 ? "active" : "removed") : null };
  } catch (e) {
    return { status: "error", message: `YouTube lookup failed: ${(e as Error).message.slice(0, 160)}` };
  }
}

/** Starts tracking a channel (or resumes a removed one), then collects its recent uploads right away. */
export async function addChannel(f: FormData): Promise<void> {
  const channelId = String(f.get("channelId") ?? "");
  const channel = (await getChannelsByIds([channelId]))[0];
  if (!channel?.uploadsPlaylistId) throw new Error("Channel has no uploads playlist");
  const c = db();
  const existing = (await c.execute({
    sql: "select id from shows where youtube_channel_id = ? or name = ? limit 1",
    args: [channel.channelId, channel.title],
  })).rows[0];
  let showId: string;
  if (existing) {
    showId = String(existing.id);
    await c.execute({
      sql: "update shows set active = 1, youtube_channel_id = ?, youtube_uploads_playlist_id = ? where id = ?",
      args: [channel.channelId, channel.uploadsPlaylistId, showId],
    });
  } else {
    showId = String((await c.execute({
      sql: "insert into shows (name, youtube_channel_id, youtube_uploads_playlist_id, active) values (?, ?, ?, 1) returning id",
      args: [channel.title, channel.channelId, channel.uploadsPlaylistId],
    })).rows[0].id);
  }
  const show = (await c.execute({ sql: "select * from shows where id = ?", args: [showId] })).rows[0];
  // Only the latest page of uploads (1 quota unit); the daily job extracts them with the rest.
  await ingestShow({
    id: showId, name: String(show.name), youtube_uploads_playlist_id: channel.uploadsPlaylistId,
    rss_url: (show.rss_url as string) || null, host_names: JSON.parse(String(show.host_names ?? "[]")),
  }, await loadCfg(), { youtubeMaxPages: 1 });
  refresh();
}

/** Stops tracking: no new episodes, hidden from rankings. Past episodes stay, so it can be re-added later. */
export async function removeChannel(f: FormData): Promise<void> {
  await db().execute({ sql: "update shows set active = 0 where id = ?", args: [String(f.get("id") ?? "")] });
  refresh();
}

export async function restoreChannel(f: FormData): Promise<void> {
  await db().execute({ sql: "update shows set active = 1 where id = ?", args: [String(f.get("id") ?? "")] });
  refresh();
}
