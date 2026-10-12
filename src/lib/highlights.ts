import { db } from "./db-core";
import { computeScores, type GuestRank, type Scores, type SponsorRank, type TopicRank } from "./score";

/**
 * Founder-facing view of the Stage 5 scores. Ordering and every number shown come from SQL here;
 * the one-line "why" under each name is built from those numbers, never written by Gemini.
 */

export type RankedGuest = GuestRank & { views: number; topEpisodeYt: string | null; spaces: string[]; why: string };
export type RankedTopic = TopicRank & { episodes30d: number; views30d: number; why: string };
export type RankedSponsor = SponsorRank & { why: string };
export type TopEpisode = {
  id: string; title: string; show: string; youtubeId: string; publishedAt: string; durationSeconds: number | null;
  views: number; likes: number | null; comments: number | null; daysLive: number; score: number;
};
export type Highlights = {
  scores: Scores;
  guests: RankedGuest[]; topics: RankedTopic[]; sponsors: RankedSponsor[];
  topEpisodes: TopEpisode[];
  weights: { like: number; comment: number };
  statsUpdatedAt: string | null;
};

const DAY = 86_400_000;
const COUNTED = "e.kind = 'full' and e.status = 'extracted' and coalesce(e.business_related, 1) = 1 and e.show_id in (select id from shows where active = 1)";

export function compact(v: number): string {
  if (v >= 10_000_000) return `${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

const list = (xs: string[], max = 3) =>
  xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} +${xs.length - max}`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

function guestWhy(g: GuestRank & { views: number }): string {
  const shows = [...new Set(g.episodes.map((e) => e.show))];
  const reach = g.views ? ` · ${compact(g.views)} views` : "";
  if (g.shows >= 2) return `On ${g.shows} of your shows in 30 days (${list(shows)})${reach}`;
  return `On ${shows[0]} · ${shortDate(g.lastSeen)}${reach}`;
}

function topicWhy(t: TopicRank & { episodes30d: number; views30d: number }): string {
  const reach = t.views30d ? ` · ${compact(t.views30d)} views in 30 days` : "";
  if (t.trend === "new") return `${t.thisWeek} ${t.thisWeek === 1 ? "episode" : "episodes"} this week, none in the 4 weeks before${reach}`;
  const avg = Number.isInteger(t.priorAvg) ? t.priorAvg : t.priorAvg.toFixed(1);
  return `${t.thisWeek} ${t.thisWeek === 1 ? "episode" : "episodes"} this week vs ${avg} a week before${reach}`;
}

function sponsorWhy(b: SponsorRank): string {
  const shows = [...new Set(b.episodes.map((e) => e.show))];
  return `${b.placements} paid ${b.placements === 1 ? "placement" : "placements"} across ${b.shows} ${b.shows === 1 ? "show" : "shows"} (${list(shows)}) · latest ${shortDate(b.lastSeen)}`;
}

export async function computeHighlights(asOf = new Date()): Promise<Highlights> {
  const c = db();
  const now = asOf.getTime();
  const from30 = new Date(now - 30 * DAY).toISOString();
  const from7 = new Date(now - 7 * DAY).toISOString();
  const end = asOf.toISOString();

  const [scores, guestViews, guestSpaces, topicViews, eps, cfg, statsAt] = await Promise.all([
    computeScores(asOf),
    c.execute({
      sql: `select a.guest_id, coalesce(sum(e.view_count), 0) views,
              (select e2.youtube_video_id from appearances a2 join episodes e2 on e2.id = a2.episode_id
                where a2.guest_id = a.guest_id and e2.youtube_video_id is not null
                order by coalesce(e2.view_count, 0) desc limit 1) top_yt
            from appearances a join episodes e on e.id = a.episode_id
            where ${COUNTED} and e.published_at >= ? and e.published_at < ? group by a.guest_id`,
      args: [from30, end],
    }),
    c.execute({
      sql: `select a.guest_id, t.label, count(*) n
            from appearances a join episodes e on e.id = a.episode_id
              join episode_topics et on et.episode_id = e.id join topics t on t.id = et.topic_id
            where ${COUNTED} and t.slug != 'other' and e.published_at >= ? and e.published_at < ?
            group by a.guest_id, t.id order by n desc`,
      args: [from30, end],
    }),
    c.execute({
      sql: `select t.slug, count(distinct e.id) eps, coalesce(sum(e.view_count), 0) views
            from episode_topics et join topics t on t.id = et.topic_id join episodes e on e.id = et.episode_id
            where ${COUNTED} and e.published_at >= ? and e.published_at < ? group by t.slug`,
      args: [from30, end],
    }),
    c.execute({
      sql: `select e.id, e.title, s.name show, e.youtube_video_id, e.published_at, e.duration_seconds,
              e.view_count, e.like_count, e.comment_count
            from episodes e join shows s on s.id = e.show_id
            where e.kind = 'full' and s.active = 1 and coalesce(e.business_related, 1) = 1
              and e.youtube_video_id is not null and e.view_count is not null
              and e.published_at >= ? and e.published_at < ?`,
      args: [from7, end],
    }),
    c.execute("select key, value from scoring_config where key in ('engagement_w_like','engagement_w_comment')"),
    c.execute("select max(stats_fetched_at) t from episodes"),
  ]);

  const views = new Map(guestViews.rows.map((r) => [String(r.guest_id), { views: Number(r.views), yt: (r.top_yt as string) || null }]));
  const spaces = new Map<string, string[]>();
  for (const r of guestSpaces.rows) {
    const arr = spaces.get(String(r.guest_id)) ?? [];
    if (arr.length < 3) arr.push(String(r.label));
    spaces.set(String(r.guest_id), arr);
  }

  // Media-rounds guests first (most shows), then everyone else from the last 30 days; ties go to reach.
  const byId = new Map<string, GuestRank>();
  for (const g of [...scores.mediaRounds, ...scores.earlyGuests]) byId.set(g.id, g);
  const allGuests = (await c.execute({
    sql: `select distinct a.guest_id from appearances a join episodes e on e.id = a.episode_id
          where ${COUNTED} and e.published_at >= ? and e.published_at < ?`,
    args: [from30, end],
  })).rows.map((r) => String(r.guest_id));
  const missing = allGuests.filter((id) => !byId.has(id));
  if (missing.length) {
    // Guests seen once in the window but also earlier (so neither media rounds nor early) still count for the founder view.
    for (const g of await guestsById(missing, from30, end)) byId.set(g.id, g);
  }
  const guests: RankedGuest[] = [...byId.values()]
    .map((g) => {
      const v = views.get(g.id) ?? { views: 0, yt: null };
      return { ...g, views: v.views, topEpisodeYt: v.yt, spaces: spaces.get(g.id) ?? [], why: "" };
    })
    .sort((a, b) => b.shows - a.shows || b.views - a.views || b.appearances - a.appearances || b.lastSeen.localeCompare(a.lastSeen));
  for (const g of guests) g.why = guestWhy(g);

  const tv = new Map(topicViews.rows.map((r) => [String(r.slug), { eps: Number(r.eps), views: Number(r.views) }]));
  const topics: RankedTopic[] = scores.topics
    .map((t) => {
      const x = tv.get(t.slug) ?? { eps: 0, views: 0 };
      const r = { ...t, episodes30d: x.eps, views30d: x.views, why: "" };
      r.why = topicWhy(r);
      return r;
    })
    // Momentum first (as in Stage 5), reach breaks ties.
    .sort((a, b) => (b.thisWeek - b.priorAvg) - (a.thisWeek - a.priorAvg) || b.views30d - a.views30d);

  const sponsors: RankedSponsor[] = scores.sponsors.map((b) => ({ ...b, why: sponsorWhy(b) }));

  const w = Object.fromEntries(cfg.rows.map((r) => [String(r.key), Number(r.value)]));
  const weights = { like: w.engagement_w_like ?? 10, comment: w.engagement_w_comment ?? 20 };
  const topEpisodes: TopEpisode[] = eps.rows
    .map((r) => {
      const v = Number(r.view_count), l = r.like_count === null ? null : Number(r.like_count);
      const cm = r.comment_count === null ? null : Number(r.comment_count);
      const daysLive = Math.max(1, (now - Date.parse(String(r.published_at))) / DAY);
      return {
        id: String(r.id), title: String(r.title), show: String(r.show), youtubeId: String(r.youtube_video_id),
        publishedAt: String(r.published_at), durationSeconds: (r.duration_seconds as number) ?? null,
        views: v, likes: l, comments: cm, daysLive: Math.round(daysLive * 10) / 10,
        // Engagement per day live, so a 2-day-old episode isn't buried under a 6-day-old one.
        score: Math.round((v + weights.like * (l ?? 0) + weights.comment * (cm ?? 0)) / daysLive),
      };
    })
    .sort((a, b) => b.score - a.score);

  return { scores, guests, topics, sponsors, topEpisodes, weights, statsUpdatedAt: (statsAt.rows[0]?.t as string) ?? null };
}

async function guestsById(ids: string[], from: string, end: string): Promise<GuestRank[]> {
  const ph = ids.map(() => "?").join(",");
  const [g, e] = await Promise.all([
    db().execute({
      sql: `select g.id, g.canonical_name name, g.company, g.role, count(distinct e.show_id) shows,
              count(distinct e.show_id || substr(e.published_at, 1, 10)) appearances, max(e.published_at) last_seen
            from appearances a join episodes e on e.id = a.episode_id join guests g on g.id = a.guest_id
            where ${COUNTED} and e.published_at >= ? and e.published_at < ? and g.id in (${ph}) group by g.id`,
      args: [from, end, ...ids],
    }),
    db().execute({
      sql: `select a.guest_id, e.id, e.title, s.name show, e.published_at
            from appearances a join episodes e on e.id = a.episode_id join shows s on s.id = e.show_id
            where ${COUNTED} and e.published_at >= ? and e.published_at < ? and a.guest_id in (${ph}) order by e.published_at desc`,
      args: [from, end, ...ids],
    }),
  ]);
  return g.rows.map((r) => ({
    id: String(r.id), name: String(r.name), company: (r.company as string) || null, role: (r.role as string) || null,
    shows: Number(r.shows), appearances: Number(r.appearances), lastSeen: String(r.last_seen),
    episodes: e.rows.filter((x) => String(x.guest_id) === String(r.id))
      .map((x) => ({ id: String(x.id), title: String(x.title), show: String(x.show), publishedAt: String(x.published_at) })),
  }));
}

export type WeekStat = { now: number; prev: number };
export type WeekStats = { episodes: WeekStat; guests: WeekStat; trending: WeekStat; sponsorMentions: WeekStat };

/** Last 7 days against the 7 before, for the Overview tiles. Same filters as the rankings (active channels, business episodes). */
export async function weekStats(asOf = new Date()): Promise<WeekStats> {
  const c = db();
  const now = asOf.getTime();
  const w = [new Date(now - 14 * DAY).toISOString(), new Date(now - 7 * DAY).toISOString(), asOf.toISOString()];
  const BASE = "e.kind = 'full' and coalesce(e.business_related, 1) = 1 and e.show_id in (select id from shows where active = 1)";
  const [eps, guests, mentions, prevScores] = await Promise.all([
    c.execute({ sql: `select sum(e.published_at >= ?) now, sum(e.published_at < ?) prev from episodes e where ${BASE} and e.published_at >= ? and e.published_at < ?`, args: [w[1], w[1], w[0], w[2]] }),
    c.execute({
      sql: `select count(distinct case when e.published_at >= ? then a.guest_id end) now, count(distinct case when e.published_at < ? then a.guest_id end) prev
            from appearances a join episodes e on e.id = a.episode_id where ${BASE} and e.status = 'extracted' and e.published_at >= ? and e.published_at < ?`,
      args: [w[1], w[1], w[0], w[2]],
    }),
    c.execute({
      sql: `select sum(e.published_at >= ?) now, sum(e.published_at < ?) prev from brand_mentions m join episodes e on e.id = m.episode_id
            where ${BASE} and e.status = 'extracted' and m.mention_type in ('paid_read', 'sponsor_disclosure') and e.published_at >= ? and e.published_at < ?`,
      args: [w[1], w[1], w[0], w[2]],
    }),
    computeScores(new Date(now - 7 * DAY)),
  ]);
  const cur = await computeScores(asOf);
  const rising = (ts: { trend: string }[]) => ts.filter((t) => t.trend === "rising" || t.trend === "new").length;
  const pair = (r: Record<string, unknown>): WeekStat => ({ now: Number(r.now ?? 0), prev: Number(r.prev ?? 0) });
  return {
    episodes: pair(eps.rows[0]), guests: pair(guests.rows[0]), sponsorMentions: pair(mentions.rows[0]),
    trending: { now: rising(cur.topics), prev: rising(prevScores.topics) },
  };
}

export type Activity = { kind: "ingest" | "extract" | "research" | "brief"; at: string; text: string };

/** The last few pipeline events, newest first, from the run logs. */
export async function recentActivity(limit = 5): Promise<Activity[]> {
  const c = db();
  const [ing, ext, ins, br] = await Promise.all([
    c.execute("select finished_at at, per_show from ingest_runs where finished_at is not null order by started_at desc limit 3"),
    c.execute("select finished_at at, extracted from extract_runs where finished_at is not null and extracted > 0 order by started_at desc limit 3"),
    c.execute("select finished_at at, generated, stats_updated from insight_runs where finished_at is not null order by started_at desc limit 3"),
    c.execute("select generated_at at, emailed from briefs order by generated_at desc limit 3"),
  ]);
  const out: (Activity & { n?: number })[] = [
    ...ing.rows.map((r) => {
      const per = Object.values(JSON.parse(String(r.per_show ?? "{}"))) as { by_kind?: { full?: number } }[];
      const full = per.reduce((s, x) => s + (x.by_kind?.full ?? 0), 0);
      return { kind: "ingest" as const, at: String(r.at), text: full ? `${full} new full ${full === 1 ? "episode" : "episodes"} collected` : "Checked channels, nothing new" };
    }),
    ...ext.rows.map((r) => ({ kind: "extract" as const, at: String(r.at), n: Number(r.extracted), text: "" })),
    ...ins.rows.map((r) => ({ kind: "research" as const, at: String(r.at), text: Number(r.generated) ? `${r.generated} research items updated` : `YouTube stats refreshed for ${r.stats_updated} episodes` })),
    ...br.rows.map((r) => ({ kind: "brief" as const, at: String(r.at), text: r.emailed === 1 ? "Weekly brief written and emailed" : "Weekly brief written" })),
  ];
  // Back-to-back runs of the same stage read as one event ("3 runs"); extraction counts add up.
  const merged: (Activity & { n?: number; runs: number })[] = [];
  for (const a of out.sort((x, y) => y.at.localeCompare(x.at)) as (Activity & { n?: number })[]) {
    const last = merged[merged.length - 1];
    if (last && last.kind === a.kind) { last.runs++; last.n = (last.n ?? 0) + (a.n ?? 0); continue; }
    merged.push({ ...a, runs: 1 });
  }
  return merged.slice(0, limit).map(({ kind, at, text, n, runs }) => ({
    kind, at,
    text: kind === "extract" ? `${n} ${n === 1 ? "episode" : "episodes"} analysed for guests, topics and sponsors${runs > 1 ? ` in ${runs} runs` : ""}`
      : runs > 1 ? `${text} (${runs} runs)` : text,
  }));
}
