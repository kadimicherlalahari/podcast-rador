import { createHash } from "node:crypto";

const BASE = "https://api.podcastindex.org/api/1.0";

export type PiFeed = {
  id: number;
  title: string;
  author: string;
  url: string;
  episodeCount: number;
  lastUpdateTime: number; // unix seconds
  language: string;
};

async function pi(path: string, params: Record<string, string>) {
  const key = process.env.PODCASTINDEX_API_KEY;
  const secret = process.env.PODCASTINDEX_API_SECRET;
  if (!key || !secret) throw new Error("PODCASTINDEX_API_KEY / PODCASTINDEX_API_SECRET not set");
  const date = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`, {
    headers: {
      "X-Auth-Key": key,
      "X-Auth-Date": date,
      Authorization: createHash("sha1").update(key + secret + date).digest("hex"),
      "User-Agent": "PodcastRadar/0.1",
    },
  });
  if (!res.ok) throw new Error(`PodcastIndex ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

type RawFeed = Partial<PiFeed>;

function toFeed(f: RawFeed): PiFeed {
  return {
    id: f.id ?? 0,
    title: f.title ?? "",
    author: f.author ?? "",
    url: f.url ?? "",
    episodeCount: f.episodeCount ?? 0,
    lastUpdateTime: f.lastUpdateTime ?? 0,
    language: f.language ?? "",
  };
}

export async function searchFeeds(term: string, max = 5): Promise<PiFeed[]> {
  const data = await pi("search/byterm", { q: term, max: String(max) });
  return (data.feeds ?? []).slice(0, max).map(toFeed);
}

export async function getFeedById(id: number): Promise<PiFeed | null> {
  const data = await pi("podcasts/byfeedid", { id: String(id) });
  return data.feed && data.feed.id ? toFeed(data.feed) : null;
}
