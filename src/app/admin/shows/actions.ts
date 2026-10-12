"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getChannelsByIds, resolveChannelInput } from "@/lib/youtube";
import { getFeedById } from "@/lib/podcastindex";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (showId?: string) => {
  revalidatePath("/admin/shows");
  if (showId) redirect(`/admin/shows?resolve=${showId}`);
};

export async function addShow(f: FormData) {
  const name = str(f, "name");
  if (name) await db().execute({ sql: "insert or ignore into shows (name) values (?)", args: [name] });
  done();
}

export async function updateShow(f: FormData) {
  const hosts = str(f, "host_names").split(",").map((h) => h.trim()).filter(Boolean);
  await db().execute({
    sql: "update shows set name = ?, host_names = ?, language = ? where id = ?",
    args: [str(f, "name"), JSON.stringify(hosts), str(f, "language") || null, str(f, "id")],
  });
  done();
}

export async function toggleActive(f: FormData) {
  await db().execute({
    sql: "update shows set active = ? where id = ?",
    args: [str(f, "active") === "1" ? 0 : 1, str(f, "id")],
  });
  done();
}

export async function confirmYoutube(f: FormData) {
  const id = str(f, "id");
  const channel = (await getChannelsByIds([str(f, "channelId")]))[0];
  if (!channel?.uploadsPlaylistId) throw new Error("Channel has no uploads playlist");
  await db().execute({
    sql: "update shows set youtube_channel_id = ?, youtube_uploads_playlist_id = ? where id = ?",
    args: [channel.channelId, channel.uploadsPlaylistId, id],
  });
  done(id);
}

// Paste a channel URL / @handle, resolve it, and store it directly (explicit user input, not a guess).
export async function confirmYoutubeByInput(f: FormData) {
  const id = str(f, "id");
  const channel = await resolveChannelInput(str(f, "input"));
  if (!channel?.uploadsPlaylistId) throw new Error("Could not resolve that channel");
  await db().execute({
    sql: "update shows set youtube_channel_id = ?, youtube_uploads_playlist_id = ? where id = ?",
    args: [channel.channelId, channel.uploadsPlaylistId, id],
  });
  done(id);
}

export async function confirmRss(f: FormData) {
  const id = str(f, "id");
  const feed = await getFeedById(Number(str(f, "feedId")));
  if (!feed) throw new Error("Feed not found in Podcast Index");
  await db().execute({
    sql: "update shows set rss_url = ?, podcastindex_feed_id = ?, language = coalesce(?, language) where id = ?",
    args: [feed.url, feed.id, feed.language || null, id],
  });
  done(id);
}

export async function confirmSpotify(f: FormData) {
  const id = str(f, "id");
  await db().execute({ sql: "update shows set spotify_show_id = ? where id = ?", args: [str(f, "spotifyId"), id] });
  done(id);
}
