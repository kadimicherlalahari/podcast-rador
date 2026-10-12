import { db } from "./db-core";
import { decodeEntities } from "./evidence";
import { generateGrounded, generateJson, RateLimitError, type WebSource } from "./gemini";
import { parseIsoDuration } from "./duration";
import { getVideos, getVideoStats, searchVideosWindow } from "./youtube";
import { docsPrompt, geminiGroundingEnabled, tavilyEnabled, tavilySearch } from "./websearch";

/**
 * On-demand "is this topic trending?" check for the founder, on the business side of the topic (videos of 4+ minutes). The verdict is computed from YouTube numbers
 * (no Gemini); Gemini only summarises what the top videos are about and, when search grounding is available,
 * what Google shows. Results are cached for 6 hours per query.
 */

export type TrendVideo = { videoId: string; title: string; channel: string; publishedAt: string; views: number; perDay: number };
export type TrendWindow = { videos: number; views: number; perDay: number };
export type TrendCheck = {
  query: string; checkedAt: string;
  verdict: "rising" | "steady" | "cooling" | "quiet";
  thisWeek: TrendWindow; lastWeek: TrendWindow; ratio: number | null;
  top: TrendVideo[];
  angle: string | null;
  yours: { id: string; title: string; show: string; publishedAt: string }[];
  google: { status: "ok"; verdict: string; summary: string; signals: string[]; sources: WebSource[] } | { status: "unavailable"; reason: string };
};

export const TREND_PRESETS = [
  "Venture capital", "Fundraising", "Startups", "Bootstrapping", "Unicorns", "IPO", "Stock market", "Personal finance",
  "Mutual funds", "AI startups", "SaaS", "Fintech", "Quick commerce", "D2C brands", "Skincare", "Beauty brands",
  "Fashion brands", "Food & beverage", "EV", "Climate tech", "Healthtech", "Edtech", "Real estate", "Manufacturing",
  "Ecommerce", "Creator economy", "Franchise", "Layoffs", "Crypto", "Gold",
];

const DAY = 86_400_000;
const CACHE_HOURS = 6;
const key = (q: string) => `q:${q.trim().toLowerCase().replace(/\s+/g, " ")}`;

// Steers YouTube toward the business side of a topic ("skincare" → brands and founders, not makeup hacks).
const BUSINESS = "(business|startup|founder|brand|market|industry|investing)";
const MIN_SECONDS = 240; // Shorts and quick clips say little about whether a topic is a business story

async function window(q: string, from: number, to: number): Promise<{ w: TrendWindow; videos: TrendVideo[] }> {
  const found = await searchVideosWindow(`${q} ${BUSINESS}`, new Date(from).toISOString(), new Date(to).toISOString(), 50);
  const long = new Set((await getVideos(found.map((v) => v.videoId)))
    .filter((v) => (parseIsoDuration(v.duration) ?? 0) >= MIN_SECONDS).map((v) => v.id));
  const kept = found.filter((v) => long.has(v.videoId)).slice(0, 25);
  const stats = new Map((await getVideoStats(kept.map((v) => v.videoId))).map((s) => [s.id, s.views ?? 0]));
  const now = Date.now();
  const videos = kept.map((v) => {
    const views = stats.get(v.videoId) ?? 0;
    const days = Math.max(1, (now - Date.parse(v.publishedAt)) / DAY);
    return { ...v, title: decodeEntities(v.title), channel: decodeEntities(v.channel), views, perDay: Math.round(views / days) };
  });
  const views = videos.reduce((s, v) => s + v.views, 0);
  const perDay = videos.length ? Math.round(videos.reduce((s, v) => s + v.perDay, 0) / videos.length) : 0;
  return { w: { videos: videos.length, views, perDay }, videos };
}

/** Rising/cooling compares average views per day since upload of the top videos in each week. */
export function trendVerdict(thisWeek: TrendWindow, lastWeek: TrendWindow): { verdict: TrendCheck["verdict"]; ratio: number | null } {
  if (thisWeek.videos < 3) return { verdict: "quiet", ratio: null };
  if (!lastWeek.perDay) return { verdict: "rising", ratio: null };
  const ratio = Math.round((thisWeek.perDay / lastWeek.perDay) * 100) / 100;
  return { verdict: ratio >= 1.5 ? "rising" : ratio <= 0.67 ? "cooling" : "steady", ratio };
}

export async function checkTrend(query: string, opts: { force?: boolean } = {}): Promise<TrendCheck> {
  const q = query.trim().slice(0, 80);
  const c = db();
  if (!opts.force) {
    const cached = (await c.execute({
      sql: "select payload, generated_at from insights where entity_type = 'topic' and entity_id = ? and kind = 'trend' and error is null",
      args: [key(q)],
    })).rows[0];
    if (cached && Date.now() - Date.parse(String(cached.generated_at)) < CACHE_HOURS * 3_600_000) return JSON.parse(String(cached.payload));
  }

  const now = Date.now();
  const [cur, prev] = await Promise.all([window(q, now - 7 * DAY, now), window(q, now - 14 * DAY, now - 7 * DAY)]);
  const { verdict, ratio } = trendVerdict(cur.w, prev.w);
  const top = [...cur.videos].sort((a, b) => b.perDay - a.perDay).slice(0, 6);

  const like = `%${q.toLowerCase()}%`;
  const yours = (await c.execute({
    sql: `select e.id, e.title, s.name show, e.published_at from episodes e join shows s on s.id = e.show_id
          where e.kind = 'full' and s.active = 1 and e.published_at >= ? and (lower(e.title) like ? or lower(e.description) like ?)
          order by e.published_at desc limit 8`,
    args: [new Date(now - 30 * DAY).toISOString(), like, like],
  })).rows.map((r) => ({ id: String(r.id), title: String(r.title), show: String(r.show), publishedAt: String(r.published_at) }));

  let angle: string | null = null;
  if (top.length) {
    try {
      angle = (await generateJson<{ angle: string }>({
        system: "You summarise, in 1-2 sentences, what this week's most-watched YouTube videos on a topic are about, using only the titles given. No numbers.",
        prompt: `Topic: ${q}\nTitles:\n${top.map((v) => `- ${v.title} (${v.channel})`).join("\n")}`,
        schema: { type: "object", properties: { angle: { type: "string" } }, required: ["angle"] }, retries: 1,
      })).angle;
    } catch { /* optional */ }
  }

  let google: TrendCheck["google"];
  const GOOGLE_SYSTEM = `You judge whether a business topic is currently trending in India from recent news and web results.
verdict is one of: "trending", "steady", "not trending". summary: 2 sentences. signals: 2-4 short dated facts. Never guess.`;
  const schema = { type: "object", properties: { verdict: { type: "string", enum: ["trending", "steady", "not trending"] }, summary: { type: "string" }, signals: { type: "array", items: { type: "string" } } }, required: ["verdict", "summary", "signals"] };
  try {
    if (geminiGroundingEnabled()) {
      const { data, sources } = await generateGrounded<{ verdict: string; summary: string; signals: string[] }>({
        system: `${GOOGLE_SYSTEM} Use Google Search (last 2 weeks).`, prompt: `Topic: ${q}`, retries: 1, schema,
      });
      google = { status: "ok", ...data, sources: sources.slice(0, 6) };
    } else if (tavilyEnabled()) {
      const news = await tavilySearch(`${q} India`, { news: true, days: 14, max: 10 });
      if (!news.length) {
        google = { status: "ok", verdict: "not trending", summary: `No news articles about "${q}" in India in the last 14 days.`, signals: [], sources: [] };
      } else {
        const data = await generateJson<{ verdict: string; summary: string; signals: string[] }>({
          system: `${GOOGLE_SYSTEM} Use ONLY the numbered articles (published in the last 14 days); ${news.length} were found.`,
          prompt: `Topic: ${q}\n\n${docsPrompt(news)}`, retries: 1, schema,
        });
        google = { status: "ok", ...data, sources: news.slice(0, 6).map((d) => ({ title: d.title, uri: d.url })) };
      }
    } else {
      google = { status: "unavailable", reason: "Web news check is off. Add a TAVILY_API_KEY (free tier) to the settings file to turn it on." };
    }
  } catch (e) {
    google = {
      status: "unavailable",
      reason: e instanceof RateLimitError || (e as { status?: number }).status === 429
        ? "Gemini is at its per-minute limit right now. Try again in a minute."
        : `Web check failed: ${(e as Error).message.slice(0, 120)}`,
    };
  }

  const result: TrendCheck = { query: q, checkedAt: new Date().toISOString(), verdict, thisWeek: cur.w, lastWeek: prev.w, ratio, top, angle, yours, google };
  await c.execute({
    sql: `insert into insights (entity_type, entity_id, kind, payload, generated_at) values ('topic', ?, 'trend', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          on conflict(entity_type, entity_id, kind) do update set payload = excluded.payload, error = null, generated_at = excluded.generated_at`,
    args: [key(q), JSON.stringify(result)],
  });
  return result;
}
