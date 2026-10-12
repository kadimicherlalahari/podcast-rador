import { db } from "./db-core";
import { decodeEntities, evidenceFound } from "./evidence";
import { generateFromVideo, generateGrounded, generateJson, RateLimitError, type WebSource } from "./gemini";
import { computeHighlights } from "./highlights";
import { getTopComments, getVideoStats, searchVideos, type YtSearchVideo } from "./youtube";
import { docsPrompt, geminiGroundingEnabled, tavilyEnabled, tavilySearch, wikipediaPerson } from "./websearch";

/**
 * Stage 6b: founder insights. YouTube stats/comments are plain API data; Gemini writes the profile, video and topic
 * summaries. Every Gemini output is cached in `insights` and refreshed at most every `insight_refresh_days`.
 */

export type GuestProfile = {
  identity_confidence: "high" | "medium" | "low";
  headline: string; current_role: string; company: string; spaces: string[];
  background: string[]; achievements: string[]; recent_news: string[]; other_appearances: string[];
  approach: { angle: string; talking_points: string[]; cautions: string[] };
};
export type EpisodeAnalysis = {
  minutes: number;
  summary: string; guest_points: string[];
  highlights: { time: string; point: string }[];
  quotes: { time: string; speaker: string; quote: string }[];
  questions_discussed: string[];
};
export type TopicBrief = {
  summary: string;
  top_questions: { question: string; episode_ids: string[] }[];
  audience_questions: { question: string; comment_quote: string }[];
  key_points: string[]; gaps: string[];
};
export type GuestVideos = { query: string; videos: YtSearchVideo[] };

export type Insight<T> = { payload: T; sources: WebSource[]; generatedAt: string; error: string | null };

export async function readInsight<T>(type: string, id: string, kind: string): Promise<Insight<T> | null> {
  const r = (await db().execute({
    sql: "select payload, sources, generated_at, error from insights where entity_type = ? and entity_id = ? and kind = ?",
    args: [type, id, kind],
  })).rows[0];
  if (!r) return null;
  return { payload: JSON.parse(String(r.payload)), sources: JSON.parse(String(r.sources)), generatedAt: String(r.generated_at), error: (r.error as string) || null };
}

async function writeInsight(type: string, id: string, kind: string, payload: unknown, sources: WebSource[] = [], error: string | null = null) {
  await db().execute({
    sql: `insert into insights (entity_type, entity_id, kind, payload, sources, error, generated_at)
          values (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          on conflict(entity_type, entity_id, kind) do update set payload = excluded.payload, sources = excluded.sources,
            error = excluded.error, generated_at = excluded.generated_at`,
    args: [type, id, kind, JSON.stringify(payload), JSON.stringify(sources), error],
  });
}

async function cfg() {
  const { rows } = await db().execute("select key, value from scoring_config where key like 'insight_%' or key = 'video_analysis_max_minutes'");
  const m = Object.fromEntries(rows.map((r) => [String(r.key), Number(r.value)]));
  return { maxCalls: m.insight_gemini_max_calls ?? 30, refreshDays: m.insight_refresh_days ?? 7, videoMinutes: m.video_analysis_max_minutes ?? 40 };
}

async function isFresh(type: string, id: string, kind: string, days: number): Promise<boolean> {
  const r = (await db().execute({
    sql: "select generated_at, error from insights where entity_type = ? and entity_id = ? and kind = ?",
    args: [type, id, kind],
  })).rows[0];
  return !!r && !r.error && Date.now() - Date.parse(String(r.generated_at)) < days * 86_400_000;
}

// ---------- YouTube data (no Gemini) ----------

const RECENT = () => new Date(Date.now() - 35 * 86_400_000).toISOString();

/** views/likes/comments for every recent full episode: 1 quota unit per 50 videos. */
export async function refreshStats(): Promise<{ updated: number; units: number }> {
  const c = db();
  const { rows } = await c.execute({
    sql: "select id, youtube_video_id y from episodes where kind = 'full' and youtube_video_id is not null and published_at >= ?",
    args: [RECENT()],
  });
  const byYt = new Map(rows.map((r) => [String(r.y), String(r.id)]));
  const stats = await getVideoStats([...byYt.keys()]);
  const now = new Date().toISOString();
  if (stats.length) {
    await c.batch(stats.map((s) => ({
      sql: "update episodes set view_count = ?, like_count = ?, comment_count = ?, stats_fetched_at = ? where id = ?",
      args: [s.views, s.likes, s.comments, now, byYt.get(s.id)!],
    })), "write");
  }
  return { updated: stats.length, units: Math.ceil(byYt.size / 50) };
}

/** Top 50 viewer comments per recent full episode, refetched weekly: 1 quota unit each. */
export async function refreshComments(refreshDays: number): Promise<{ fetched: number; units: number }> {
  const c = db();
  const { rows } = await c.execute({
    sql: `select e.id, e.youtube_video_id y from episodes e
          where e.kind = 'full' and e.youtube_video_id is not null and e.published_at >= ?
            and not exists (select 1 from insights i where i.entity_type = 'episode' and i.entity_id = e.id and i.kind = 'comments'
                            and julianday('now') - julianday(i.generated_at) < ?)`,
    args: [RECENT(), refreshDays],
  });
  let fetched = 0;
  for (const r of rows) {
    const comments = await getTopComments(String(r.y));
    await c.batch([
      { sql: "delete from video_comments where episode_id = ?", args: [String(r.id)] },
      ...comments.map((m) => ({
        sql: "insert or replace into video_comments (id, episode_id, text, like_count, published_at) values (?, ?, ?, ?, ?)",
        args: [m.id, String(r.id), m.text.slice(0, 2000), m.likes, m.publishedAt],
      })),
    ], "write");
    await writeInsight("episode", String(r.id), "comments", { count: comments.length });
    fetched += comments.length;
  }
  return { fetched, units: rows.length };
}

/** The guest's other YouTube videos (search.list, 100 units). Our own monitored episodes are filtered out. */
export async function generateGuestVideos(guestId: string): Promise<void> {
  const g = (await db().execute({ sql: "select canonical_name, company from guests where id = ?", args: [guestId] })).rows[0];
  if (!g) throw new Error("Guest not found");
  const query = [g.canonical_name, g.company].filter(Boolean).join(" ");
  const ours = new Set((await db().execute("select youtube_video_id y from episodes where youtube_video_id is not null")).rows.map((r) => String(r.y)));
  // search.list returns HTML-escaped titles ("&amp;"); store plain text.
  const videos = (await searchVideos(String(query), 12)).filter((v) => !ours.has(v.videoId) && !/#shorts\b/i.test(v.title))
    .slice(0, 6).map((v) => ({ ...v, title: decodeEntities(v.title), channel: decodeEntities(v.channel) }));
  await writeInsight("guest", guestId, "youtube", { query, videos } satisfies GuestVideos);
}

// ---------- Gemini ----------

type Budget = { calls: number; max: number };
const spend = (b: Budget) => () => { b.calls++; };
const left = (b: Budget) => Math.max(0, Math.min(3, b.max - b.calls));

const str = { type: "string" };
const strs = { type: "array", items: str };

const PROFILE_SYSTEM = `You research podcast guests for the founder of an Indian YouTube channel about startups and business leaders.
Use Google Search. State only facts you found in search results; never guess. If several people share the name, use the context
(company, the episodes listed) to pick the right one and set identity_confidence accordingly ("low" if you could not tell).
Keep every bullet short (under 25 words). Do not use LinkedIn as a source.
other_appearances: podcasts, talks and interviews OTHER than the appearances listed in the prompt.
approach: how the founder should pitch this person for an interview: the angle that would interest them, 3-5 specific talking points
not already covered in the listed episodes, and cautions (sensitive topics, recent controversies, exclusivity).`;

export async function generateGuestProfile(guestId: string, budget: Budget = { calls: 0, max: 3 }): Promise<void> {
  const c = db();
  const g = (await c.execute({ sql: "select canonical_name, company, role from guests where id = ?", args: [guestId] })).rows[0];
  if (!g) throw new Error("Guest not found");
  const eps = (await c.execute({
    sql: `select e.title, s.name show, e.published_at from appearances a join episodes e on e.id = a.episode_id
          join shows s on s.id = e.show_id where a.guest_id = ? order by e.published_at desc limit 8`,
    args: [guestId],
  })).rows;
  const prompt = [
    `Guest: ${g.canonical_name}`,
    g.company || g.role ? `Known from episode descriptions: ${[g.role, g.company].filter(Boolean).join(", ")}` : "",
    `Recent appearances on the shows we monitor:\n${eps.map((e) => `- ${e.show} (${String(e.published_at).slice(0, 10)}): ${e.title}`).join("\n")}`,
    "Return the JSON profile.",
  ].filter(Boolean).join("\n\n");
  const schema = {
    type: "object",
    properties: {
      identity_confidence: { type: "string", enum: ["high", "medium", "low"] },
      headline: str, current_role: str, company: str, spaces: strs,
      background: strs, achievements: strs, recent_news: strs, other_appearances: strs,
      approach: { type: "object", properties: { angle: str, talking_points: strs, cautions: strs }, required: ["angle", "talking_points", "cautions"] },
    },
    required: ["identity_confidence", "headline", "current_role", "company", "spaces", "background", "achievements", "recent_news", "other_appearances", "approach"],
  };
  if (geminiGroundingEnabled()) {
    const { data, sources } = await generateGrounded<GuestProfile>({
      system: PROFILE_SYSTEM, prompt, schema, onAttempt: spend(budget), retries: left(budget),
    });
    await writeInsight("guest", guestId, "profile", data, sources.slice(0, 12));
    return;
  }

  // No Google grounding on this key: collect the documents ourselves and have Gemini write only from them.
  const name = String(g.canonical_name);
  const context = String(g.company ?? "");
  const [wiki, web, news] = await Promise.all([
    wikipediaPerson(name, context).catch(() => null),
    tavilySearch(`${name} ${context}`.trim(), { max: 8 }).catch(() => []),
    tavilySearch(`${name} ${context}`.trim(), { news: true, days: 90, max: 5 }).catch(() => []),
  ]);
  const seen = new Set<string>();
  const docs = [...(wiki ? [wiki] : []), ...web, ...news]
    .filter((d) => !/linkedin\.com/.test(d.url) && !seen.has(d.url) && seen.add(d.url));
  if (!docs.length) {
    throw new Error(tavilyEnabled()
      ? "No web results found for this guest."
      : "No Wikipedia page for this guest. Add a TAVILY_API_KEY to search the wider web.");
  }
  const data = await generateJson<GuestProfile>({
    system: PROFILE_SYSTEM.replace("Use Google Search. State only facts you found in search results; never guess.",
      "Use ONLY the numbered documents provided. State only facts they contain; never guess or add outside knowledge.")
      + " recent_news: only items with a date in the documents; include the date.",
    prompt: `${prompt}\n\n--- DOCUMENTS ---\n${docsPrompt(docs)}`,
    schema, onAttempt: spend(budget), retries: left(budget),
  });
  await writeInsight("guest", guestId, "profile", data, docs.map((d) => ({ title: d.title, uri: d.url })).slice(0, 12));
}

const VIDEO_SYSTEM = `You watch an episode of an Indian startup/business podcast for the channel's founder, who is deciding whether to book this guest
or cover this topic. Report only what is actually said or shown in the video. Times are mm:ss (or h:mm:ss) from the start.
Quotes must be the speaker's own words (translate Hindi to English and say so with "(translated)" at the end).
questions_discussed: the main questions the host asks or the conversation answers, phrased as a viewer would search them.`;

export async function analyseEpisode(episodeId: string, minutes: number, budget: Budget = { calls: 0, max: 3 }): Promise<void> {
  const e = (await db().execute({
    sql: `select e.youtube_video_id y, e.title, e.duration_seconds d, s.name show, s.host_names
          from episodes e join shows s on s.id = e.show_id where e.id = ?`,
    args: [episodeId],
  })).rows[0];
  if (!e?.y) throw new Error("Episode has no YouTube video");
  const watch = Math.min(minutes, Math.ceil(Number(e.d ?? minutes * 60) / 60));
  const schema = {
    type: "object",
    properties: {
      summary: str, guest_points: strs,
      highlights: { type: "array", items: { type: "object", properties: { time: str, point: str }, required: ["time", "point"] } },
      quotes: { type: "array", items: { type: "object", properties: { time: str, speaker: str, quote: str }, required: ["time", "speaker", "quote"] } },
      questions_discussed: strs,
    },
    required: ["summary", "guest_points", "highlights", "quotes", "questions_discussed"],
  };
  try {
    const data = await generateFromVideo<Omit<EpisodeAnalysis, "minutes">>({
      videoId: String(e.y), endOffsetSec: watch * 60, system: VIDEO_SYSTEM, schema,
      prompt: `Show: ${e.show}. Hosts: ${JSON.parse(String(e.host_names ?? "[]")).join(", ") || "unknown"}. Title: ${e.title}.
Watch the first ${watch} minutes. Give a 2-3 sentence summary, 4-6 points the guest makes, 4-8 timestamped highlights,
2-4 verbatim quotes, and 4-8 questions discussed.`,
      onAttempt: spend(budget), retries: left(budget),
    });
    await writeInsight("episode", episodeId, "analysis", { minutes: watch, ...data } satisfies EpisodeAnalysis);
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    await writeInsight("episode", episodeId, "analysis", {}, [], (err as Error).message.slice(0, 500));
    throw err;
  }
}

const TOPIC_SYSTEM = `You brief the founder of an Indian YouTube channel about startups on one topic, using ONLY the episodes and viewer comments given
(they come from the 10 channels the founder monitors). Do not add outside knowledge.
- top_questions: the 5-8 most important questions these episodes covered, phrased as a viewer would search them, each with the ids of
  the episodes that cover it (only ids from the input).
- audience_questions: up to 6 questions viewers are asking in the comments. comment_quote must be an EXACT substring of one comment.
- key_points: the 4-6 most useful takeaways across episodes.
- gaps: 2-4 angles nobody covered yet that the founder could own.`;

export async function generateTopicBrief(slug: string, budget: Budget = { calls: 0, max: 3 }): Promise<void> {
  const c = db();
  const topic = (await c.execute({ sql: "select id, label from topics where slug = ?", args: [slug] })).rows[0];
  if (!topic) throw new Error("Topic not found");
  const eps = (await c.execute({
    sql: `select e.id, e.title, e.description, s.name show, e.view_count from episode_topics et
          join episodes e on e.id = et.episode_id join shows s on s.id = e.show_id
          where et.topic_id = ? and e.kind = 'full' and e.status = 'extracted' and coalesce(e.business_related, 1) = 1 and e.published_at >= ?
            and e.show_id in (select id from shows where active = 1)
          order by coalesce(e.view_count, 0) desc limit 15`,
    args: [String(topic.id), new Date(Date.now() - 30 * 86_400_000).toISOString()],
  })).rows;
  if (!eps.length) throw new Error("No episodes on this topic in the last 30 days");
  const ids = eps.map((e) => String(e.id));
  const ph = ids.map(() => "?").join(",");
  const [comments, analyses] = await Promise.all([
    c.execute({ sql: `select episode_id, text from video_comments where episode_id in (${ph}) order by like_count desc`, args: ids }),
    c.execute({ sql: `select entity_id, payload from insights where entity_type = 'episode' and kind = 'analysis' and error is null and entity_id in (${ph})`, args: ids }),
  ]);
  const byEp = new Map<string, string[]>();
  for (const r of comments.rows) {
    const arr = byEp.get(String(r.episode_id)) ?? [];
    if (arr.length < 12) arr.push(String(r.text).replace(/\s+/g, " ").slice(0, 280));
    byEp.set(String(r.episode_id), arr);
  }
  const watched = new Map(analyses.rows.map((r) => [String(r.entity_id), JSON.parse(String(r.payload)) as EpisodeAnalysis]));
  const allComments = [...byEp.values()].flat().join("\n");
  const prompt = `Topic: ${topic.label}\n\n` + eps.map((e) => {
    const a = watched.get(String(e.id));
    return [
      `### Episode id=${e.id}`,
      `Show: ${e.show} · ${e.view_count ?? "?"} views`,
      `Title: ${e.title}`,
      `Description: ${String(e.description ?? "").slice(0, 1200)}`,
      a ? `Questions discussed (watched): ${a.questions_discussed.join(" | ")}` : "",
      byEp.get(String(e.id))?.length ? `Top viewer comments:\n${byEp.get(String(e.id))!.map((t) => `- ${t}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");
  const schema = {
    type: "object",
    properties: {
      summary: str,
      top_questions: { type: "array", items: { type: "object", properties: { question: str, episode_ids: strs }, required: ["question", "episode_ids"] } },
      audience_questions: { type: "array", items: { type: "object", properties: { question: str, comment_quote: str }, required: ["question", "comment_quote"] } },
      key_points: strs, gaps: strs,
    },
    required: ["summary", "top_questions", "audience_questions", "key_points", "gaps"],
  };
  const raw = await generateJson<TopicBrief>({ system: TOPIC_SYSTEM, prompt, schema, onAttempt: spend(budget), retries: left(budget) });
  // Same guard as extraction: unknown episode ids and comment quotes not found in the input are dropped.
  const known = new Set(ids);
  const brief: TopicBrief = {
    ...raw,
    top_questions: raw.top_questions
      .map((q) => ({ ...q, episode_ids: q.episode_ids.filter((id) => known.has(id)) }))
      .filter((q) => q.episode_ids.length),
    audience_questions: raw.audience_questions.filter((q) => q.comment_quote && evidenceFound(q.comment_quote, allComments)),
  };
  await writeInsight("topic", slug, "brief", brief);
}

// ---------- Orchestration ----------

export type InsightSummary = {
  statsUpdated: number; commentsFetched: number; generated: number; geminiCalls: number; youtubeUnits: number;
  stopReason: "done" | "call_cap" | "deadline" | "rate_limited"; errors: string[];
};

/**
 * Daily, after scoring: refresh YouTube stats and comments, then (capped) Gemini work for what the founder sees first:
 * profiles + other videos for the top 10 guests, video analysis (top 3 guests' and top 3 topics' best episodes first,
 * then every other recent business episode), and briefs for the top 6 topics. Anything already fresh is skipped, so reruns are cheap.
 */
export async function runInsights(opts: { deadlineMs?: number; log?: (s: string) => void } = {}): Promise<InsightSummary> {
  const c = db();
  const conf = await cfg();
  const started = new Date().toISOString();
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const budget: Budget = { calls: 0, max: conf.maxCalls };
  const sum: InsightSummary = { statsUpdated: 0, commentsFetched: 0, generated: 0, geminiCalls: 0, youtubeUnits: 0, stopReason: "done", errors: [] };
  const log = opts.log ?? (() => {});

  try {
    const s = await refreshStats();
    sum.statsUpdated = s.updated; sum.youtubeUnits += s.units;
    const cm = await refreshComments(conf.refreshDays);
    sum.commentsFetched = cm.fetched; sum.youtubeUnits += cm.units;
    log(`stats for ${s.updated} episodes, ${cm.fetched} comments`);
  } catch (e) {
    sum.errors.push(`youtube: ${(e as Error).message}`);
  }

  const h = await computeHighlights();
  const topGuests = h.guests.slice(0, 10);
  const topTopics = h.topics.slice(0, 6);
  const topicEpisode = async (slug: string) => (await c.execute({
    sql: `select e.id from episode_topics et join topics t on t.id = et.topic_id join episodes e on e.id = et.episode_id
          where t.slug = ? and e.kind = 'full' and e.youtube_video_id is not null and e.published_at >= ?
          order by coalesce(e.view_count, 0) desc limit 1`,
    args: [slug, new Date(Date.now() - 30 * 86_400_000).toISOString()],
  })).rows[0]?.id as string | undefined;
  const guestEpisode = async (guestId: string) => (await c.execute({
    sql: `select e.id from appearances a join episodes e on e.id = a.episode_id
          where a.guest_id = ? and e.youtube_video_id is not null order by coalesce(e.view_count, 0) desc limit 1`,
    args: [guestId],
  })).rows[0]?.id as string | undefined;

  type Task = { label: string; fresh: () => Promise<boolean>; run: () => Promise<void>; gemini: boolean };
  const tasks: Task[] = [];
  for (const g of topGuests) {
    tasks.push({ label: `profile ${g.name}`, gemini: true, fresh: () => isFresh("guest", g.id, "profile", conf.refreshDays), run: () => generateGuestProfile(g.id, budget) });
  }
  // Videos are watched before topic briefs so the briefs can use "questions discussed".
  const watch = new Set<string>();
  for (const g of topGuests.slice(0, 3)) { const id = await guestEpisode(g.id); if (id) watch.add(id); }
  for (const t of topTopics.slice(0, 3)) { const id = await topicEpisode(t.slug); if (id) watch.add(id); }
  // Then every other recent business episode, most viewed first, as far as the call cap allows.
  for (const r of (await c.execute({
    sql: `select id from episodes where kind = 'full' and status = 'extracted' and business_related = 1
            and youtube_video_id is not null and published_at >= ? order by coalesce(view_count, 0) desc`,
    args: [RECENT()],
  })).rows) watch.add(String(r.id));
  for (const id of watch) {
    tasks.push({ label: `watch episode ${id}`, gemini: true, fresh: () => isFresh("episode", id, "analysis", 3650), run: () => analyseEpisode(id, conf.videoMinutes, budget) });
  }
  for (const t of topTopics) {
    tasks.push({ label: `topic brief ${t.label}`, gemini: true, fresh: () => isFresh("topic", t.slug, "brief", conf.refreshDays), run: () => generateTopicBrief(t.slug, budget) });
  }
  for (const g of topGuests) {
    tasks.push({ label: `youtube ${g.name}`, gemini: false, fresh: () => isFresh("guest", g.id, "youtube", conf.refreshDays), run: async () => { await generateGuestVideos(g.id); sum.youtubeUnits += 100; } });
  }

  let geminiOff = false;
  for (const t of tasks) {
    if (t.gemini && geminiOff) continue;
    if (await t.fresh()) continue;
    if (Date.now() > deadline) { sum.stopReason = "deadline"; break; }
    if (t.gemini && budget.calls >= budget.max) { if (sum.stopReason === "done") sum.stopReason = "call_cap"; continue; }
    try {
      await t.run();
      sum.generated++;
      log(`✓ ${t.label}`);
    } catch (e) {
      if (e instanceof RateLimitError) {
        sum.errors.push(e.message);
        sum.stopReason = "rate_limited";
        log(`⏸ ${e.message}`);
        geminiOff = true; // finish the YouTube-only tasks
        continue;
      }
      sum.errors.push(`${t.label}: ${(e as Error).message.slice(0, 300)}`);
      log(`✗ ${t.label}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  sum.geminiCalls = budget.calls;

  await c.execute({
    sql: `insert into insight_runs (started_at, finished_at, stats_updated, comments_fetched, generated, gemini_calls, youtube_units, stop_reason, errors)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [started, new Date().toISOString(), sum.statsUpdated, sum.commentsFetched, sum.generated, sum.geminiCalls, sum.youtubeUnits, sum.stopReason, JSON.stringify(sum.errors)],
  });
  return sum;
}
