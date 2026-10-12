import { db } from "./db-core";
import { sponsorScore, topicTrend, weekStartIst, type Trend } from "./entities";

export type EpisodeRef = { id: string; title: string; show: string; publishedAt: string; mentionType?: string };
export type GuestRank = {
  id: string; name: string; company: string | null; role: string | null;
  shows: number; appearances: number; lastSeen: string; episodes: EpisodeRef[];
};
export type TopicRank = { slug: string; label: string; thisWeek: number; priorFourWeeks: number; priorAvg: number; ratio: number | null; trend: Trend };
export type SponsorRank = { id: string; name: string; shows: number; placements: number; lastSeen: string; score: number; episodes: EpisodeRef[] };
export type Scores = {
  asOf: string; weekStart: string;
  windows: { guestsFrom: string; topicsThisWeekFrom: string; topicsPriorFrom: string; sponsorsFrom: string };
  weights: { shows: number; placements: number; recency: number; halflifeDays: number; sponsorWindowDays: number };
  mediaRounds: GuestRank[]; earlyGuests: GuestRank[]; topics: TopicRank[]; sponsors: SponsorRank[];
};

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
// Only full, extracted episodes count; clips and trailers never inflate a ranking.
const COUNTED = "e.kind = 'full' and e.status = 'extracted'";
// Ingest sometimes keeps the YouTube and RSS copies of one episode as two rows (different titles, same day),
// so appearances and placements count one per show per day.
const SHOW_DAY = "(e.show_id || substr(e.published_at, 1, 10))";
const SHOW_DAY2 = SHOW_DAY.replaceAll("e.", "e2.");

async function episodesFor(sql: string, args: (string | number)[]): Promise<Map<string, EpisodeRef[]>> {
  const out = new Map<string, EpisodeRef[]>();
  for (const r of (await db().execute({ sql, args })).rows) {
    const list = out.get(String(r.entity_id)) ?? [];
    list.push({
      id: String(r.id), title: String(r.title), show: String(r.show), publishedAt: String(r.published_at),
      ...(r.mention_type ? { mentionType: String(r.mention_type) } : {}),
    });
    out.set(String(r.entity_id), list);
  }
  return out;
}

/**
 * Stage 5. All counting and ranking is SQL over extracted episodes; the only arithmetic outside SQL is the
 * sponsor recency decay and the topic ratio. Windows end at `asOf` (default now), so a Monday 03:30 IST run
 * covers the week that just ended.
 */
export async function computeScores(asOf = new Date()): Promise<Scores> {
  const c = db();
  const now = asOf.getTime();
  const cfg = Object.fromEntries((await c.execute("select key, value from scoring_config where key like 'sponsor_%'")).rows
    .map((r) => [String(r.key), Number(r.value)]));
  const weights = {
    shows: cfg.sponsor_w_shows ?? 3, placements: cfg.sponsor_w_placements ?? 1, recency: cfg.sponsor_w_recency ?? 2,
    halflifeDays: cfg.sponsor_recency_halflife_days ?? 14, sponsorWindowDays: cfg.sponsor_window_days ?? 60,
  };
  const end = iso(now);
  const windows = {
    guestsFrom: iso(now - 30 * DAY), topicsThisWeekFrom: iso(now - 7 * DAY), topicsPriorFrom: iso(now - 35 * DAY),
    sponsorsFrom: iso(now - weights.sponsorWindowDays * DAY),
  };

  const [guests, topics, sponsors] = await Promise.all([
    c.execute({
      sql: `select g.id, g.canonical_name name, g.company, g.role,
              count(distinct e.show_id) shows, count(distinct ${SHOW_DAY}) appearances, max(e.published_at) last_seen,
              (select count(distinct ${SHOW_DAY2}) from appearances a2 join episodes e2 on e2.id = a2.episode_id
                where a2.guest_id = g.id and e2.kind = 'full') ever
            from appearances a join episodes e on e.id = a.episode_id join guests g on g.id = a.guest_id
            where ${COUNTED} and e.published_at >= ? and e.published_at < ?
            group by g.id
            order by shows desc, appearances desc, last_seen desc`,
      args: [windows.guestsFrom, end],
    }),
    c.execute({
      sql: `select t.slug, t.label,
              sum(e.published_at >= ?) this_week, sum(e.published_at < ?) prior
            from episode_topics et join topics t on t.id = et.topic_id join episodes e on e.id = et.episode_id
            where ${COUNTED} and t.slug != 'other' and e.published_at >= ? and e.published_at < ?
            group by t.id
            having count(*) >= 2`,
      args: [windows.topicsThisWeekFrom, windows.topicsThisWeekFrom, windows.topicsPriorFrom, end],
    }),
    c.execute({
      sql: `select b.id, b.canonical_name name, count(distinct e.show_id) shows, count(distinct ${SHOW_DAY}) placements,
              max(e.published_at) last_seen
            from brand_mentions m join episodes e on e.id = m.episode_id join brands b on b.id = m.brand_id
            where ${COUNTED} and m.mention_type in ('paid_read', 'sponsor_disclosure')
              and e.published_at >= ? and e.published_at < ?
            group by b.id`,
      args: [windows.sponsorsFrom, end],
    }),
  ]);

  const guestEps = await episodesFor(
    `select a.guest_id entity_id, e.id, e.title, s.name show, e.published_at
     from appearances a join episodes e on e.id = a.episode_id join shows s on s.id = e.show_id
     where ${COUNTED} and e.published_at >= ? and e.published_at < ? order by e.published_at desc`,
    [windows.guestsFrom, end],
  );
  const sponsorEps = await episodesFor(
    `select m.brand_id entity_id, e.id, e.title, s.name show, e.published_at, m.mention_type
     from brand_mentions m join episodes e on e.id = m.episode_id join shows s on s.id = e.show_id
     where ${COUNTED} and m.mention_type in ('paid_read', 'sponsor_disclosure')
       and e.published_at >= ? and e.published_at < ? order by e.published_at desc`,
    [windows.sponsorsFrom, end],
  );

  const toGuest = (r: Record<string, unknown>): GuestRank => ({
    id: String(r.id), name: String(r.name), company: (r.company as string) || null, role: (r.role as string) || null,
    shows: Number(r.shows), appearances: Number(r.appearances), lastSeen: String(r.last_seen),
    episodes: guestEps.get(String(r.id)) ?? [],
  });

  return {
    asOf: end, weekStart: weekStartIst(asOf), windows, weights,
    // Media rounds: 2+ distinct shows in the last 30 days.
    mediaRounds: guests.rows.filter((r) => Number(r.shows) >= 2).map(toGuest),
    // Early: exactly one appearance ever in our data, and it's within the last 30 days. Newest first.
    earlyGuests: guests.rows.filter((r) => Number(r.ever) === 1).map(toGuest)
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
    topics: topics.rows
      .map((r) => {
        const thisWeek = Number(r.this_week), prior = Number(r.prior);
        return { slug: String(r.slug), label: String(r.label), thisWeek, priorFourWeeks: prior, ...topicTrend(thisWeek, prior) };
      })
      .sort((a, b) => (b.thisWeek - b.priorAvg) - (a.thisWeek - a.priorAvg) || b.thisWeek - a.thisWeek),
    sponsors: sponsors.rows
      .map((r) => {
        const s = { shows: Number(r.shows), placements: Number(r.placements), daysSinceLast: (now - Date.parse(String(r.last_seen))) / DAY };
        return {
          id: String(r.id), name: String(r.name), shows: s.shows, placements: s.placements, lastSeen: String(r.last_seen),
          score: sponsorScore(s, weights), episodes: sponsorEps.get(String(r.id)) ?? [],
        };
      })
      .sort((a, b) => b.score - a.score || b.lastSeen.localeCompare(a.lastSeen)),
  };
}
