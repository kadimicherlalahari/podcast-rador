import { Resend } from "resend";
import { db } from "./db-core";
import { weekStartIst } from "./entities";
import { generateJson } from "./gemini";
import { compact, computeHighlights } from "./highlights";
import { readInsight, type EpisodeAnalysis, type GuestProfile, type TopicBrief } from "./insights";

/**
 * Stage 7: the weekly brief. The payload (every name, number and link) comes from SQL scores and cached insights;
 * Gemini writes only prose: the week summary, a "why now" per item, topic advice, and outreach drafts the founder
 * sends themselves. Saved to `briefs`, drafts to `pipeline`, and emailed via Resend.
 */

export type BriefGuest = {
  id: string; name: string; role: string | null; company: string | null; why: string; spaces: string[];
  headline: string | null; angle: string | null; talkingPoints: string[]; saidOnShow: string | null;
  episodes: { id: string; title: string; show: string }[];
};
export type BriefTopic = { slug: string; label: string; trend: string; why: string; summary: string | null; questions: string[]; gaps: string[] };
export type BriefBrand = { id: string; name: string; why: string; shows: string[] };
export type BriefEpisode = { id: string; title: string; show: string; youtubeId: string; views: number; likes: number | null; comments: number | null };
export type Draft = { subject: string; body: string };
export type BriefData = {
  weekStart: string; asOf: string; analysedEpisodes: number; channels: number;
  guests: (BriefGuest & { whyNow: string; draft: Draft })[];
  topics: (BriefTopic & { advice: string })[];
  brands: (BriefBrand & { whyNow: string; draft: Draft })[];
  topEpisodes: BriefEpisode[];
  narrative: string;
};

const TOP = 5;

async function payload() {
  const c = db();
  const h = await computeHighlights();
  const guests: BriefGuest[] = [];
  for (const g of h.guests.slice(0, TOP)) {
    const profile = (await readInsight<GuestProfile>("guest", g.id, "profile"))?.payload ?? null;
    const top = (await c.execute({
      sql: `select e.id from appearances a join episodes e on e.id = a.episode_id where a.guest_id = ? order by coalesce(e.view_count, 0) desc limit 1`,
      args: [g.id],
    })).rows[0];
    const watched = top ? (await readInsight<EpisodeAnalysis>("episode", String(top.id), "analysis")) : null;
    guests.push({
      id: g.id, name: g.name, role: g.role, company: g.company, why: g.why, spaces: profile?.spaces?.length ? profile.spaces : g.spaces,
      headline: profile?.headline ?? null, angle: profile?.approach.angle ?? null, talkingPoints: profile?.approach.talking_points ?? [],
      saidOnShow: watched && !watched.error ? watched.payload.summary : null,
      episodes: g.episodes.slice(0, 3).map((e) => ({ id: e.id, title: e.title, show: e.show })),
    });
  }
  const topics: BriefTopic[] = [];
  for (const t of h.topics.slice(0, TOP)) {
    const b = (await readInsight<TopicBrief>("topic", t.slug, "brief"))?.payload ?? null;
    topics.push({
      slug: t.slug, label: t.label, trend: t.trend, why: t.why, summary: b?.summary ?? null,
      questions: b?.top_questions.slice(0, 4).map((q) => q.question) ?? [], gaps: b?.gaps ?? [],
    });
  }
  const brands: BriefBrand[] = h.sponsors.slice(0, TOP).map((b) => ({
    id: b.id, name: b.name, why: b.why, shows: [...new Set(b.episodes.map((e) => e.show))],
  }));
  const topEpisodes: BriefEpisode[] = h.topEpisodes.slice(0, 3).map((e) => ({
    id: e.id, title: e.title, show: e.show, youtubeId: e.youtubeId, views: e.views, likes: e.likes, comments: e.comments,
  }));
  const counts = (await c.execute(`select (select count(*) from episodes where kind = 'full' and status = 'extracted' and business_related = 1) eps,
    (select count(*) from shows where active = 1) ch`)).rows[0];
  return { h, guests, topics, brands, topEpisodes, analysedEpisodes: Number(counts.eps), channels: Number(counts.ch) };
}

const SYSTEM = `You write the weekly brief for the founder of an Indian YouTube channel about startups and business leaders.
Use ONLY the facts in the JSON payload. Never invent numbers, dates, shows, achievements or contact details.
- narrative: 3-4 sentences on what moved this week across the monitored channels.
- guests[].why_now: one sentence on why to book them now.
- guests[].email: a short, warm booking pitch (subject + body, 90-140 words) from the founder to the guest. Reference the specific
  conversation they had on the other show and 1-2 fresh angles the founder's show could explore. Sign off as "[Your name], [Your channel]".
- topics[].advice: one or two sentences on how the founder should cover it (format, angle, which question to lead with).
- brands[].why_now: one sentence on why to pitch them now.
- brands[].email: a short sponsorship pitch (subject + body, 80-120 words) noting that they already sponsor similar shows (name them from
  the payload) and offering an integration on the founder's channel. Sign off as "[Your name], [Your channel]".
Plain text only in email bodies (no markdown), with blank lines between paragraphs.`;

const str = { type: "string" };
const draft = { type: "object", properties: { subject: str, body: str }, required: ["subject", "body"] };

export async function buildBrief(asOf = new Date()): Promise<{ id: string; data: BriefData }> {
  const p = await payload();
  const input = {
    week_start: weekStartIst(asOf),
    guests: p.guests.map(({ id, name, role, company, why, spaces, headline, angle, talkingPoints, saidOnShow, episodes }) =>
      ({ id, name, role, company, why_ranked: why, spaces, headline, suggested_angle: angle, talking_points: talkingPoints, what_they_said: saidOnShow, episodes })),
    topics: p.topics.map(({ slug, label, trend, why, summary, questions, gaps }) => ({ slug, label, trend, why_ranked: why, summary, top_questions: questions, uncovered_angles: gaps })),
    brands: p.brands.map(({ id, name, why, shows }) => ({ id, name, why_ranked: why, sponsors_these_shows: shows })),
    top_episodes: p.topEpisodes.map((e) => ({ title: e.title, show: e.show, views: e.views })),
  };
  const out = await generateJson<{
    narrative: string;
    guests: { id: string; why_now: string; email: Draft }[];
    topics: { slug: string; advice: string }[];
    brands: { id: string; why_now: string; email: Draft }[];
  }>({
    system: SYSTEM, prompt: JSON.stringify(input), retries: 4,
    schema: {
      type: "object",
      properties: {
        narrative: str,
        guests: { type: "array", items: { type: "object", properties: { id: str, why_now: str, email: draft }, required: ["id", "why_now", "email"] } },
        topics: { type: "array", items: { type: "object", properties: { slug: str, advice: str }, required: ["slug", "advice"] } },
        brands: { type: "array", items: { type: "object", properties: { id: str, why_now: str, email: draft }, required: ["id", "why_now", "email"] } },
      },
      required: ["narrative", "guests", "topics", "brands"],
    },
  });
  // Gemini's text is matched back by id; anything it skipped falls back to the numbers-only line.
  const g = new Map(out.guests.map((x) => [x.id, x]));
  const t = new Map(out.topics.map((x) => [x.slug, x]));
  const b = new Map(out.brands.map((x) => [x.id, x]));
  const none: Draft = { subject: "", body: "" };
  const data: BriefData = {
    weekStart: weekStartIst(asOf), asOf: asOf.toISOString(), analysedEpisodes: p.analysedEpisodes, channels: p.channels,
    narrative: out.narrative,
    guests: p.guests.map((x) => ({ ...x, whyNow: g.get(x.id)?.why_now ?? x.why, draft: g.get(x.id)?.email ?? none })),
    topics: p.topics.map((x) => ({ ...x, advice: t.get(x.slug)?.advice ?? "" })),
    brands: p.brands.map((x) => ({ ...x, whyNow: b.get(x.id)?.why_now ?? x.why, draft: b.get(x.id)?.email ?? none })),
    topEpisodes: p.topEpisodes,
  };

  const c = db();
  const id = String((await c.execute({
    sql: "insert into briefs (week_start, data, narrative) values (?, ?, ?) returning id",
    args: [data.weekStart, JSON.stringify(data), data.narrative],
  })).rows[0].id);
  // Drafts land on the Outreach page; a draft the founder has already moved past "suggested" is left alone.
  const drafts = [
    ...data.guests.filter((x) => x.draft.body).map((x) => ({ type: "guest", id: x.id, d: x.draft })),
    ...data.brands.filter((x) => x.draft.body).map((x) => ({ type: "brand", id: x.id, d: x.draft })),
  ];
  if (drafts.length) {
    await c.batch(drafts.map((x) => ({
      sql: `insert into pipeline (entity_type, entity_id, status, draft, updated_at) values (?, ?, 'suggested', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            on conflict(entity_type, entity_id) do update set draft = excluded.draft, updated_at = excluded.updated_at
            where pipeline.status = 'suggested'`,
      args: [x.type, x.id, `Subject: ${x.d.subject}\n\n${x.d.body}`],
    })), "write");
  }
  return { id, data };
}

// ---------- email ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const para = (s: string) => esc(s).split(/\n{2,}/).map((p) => `<p style="margin:0 0 10px">${p.replace(/\n/g, "<br>")}</p>`).join("");
const fmtWeek = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

function section(title: string, inner: string) {
  return `<tr><td style="padding:28px 0 8px"><h2 style="margin:0;font-size:17px;color:#14161b">${esc(title)}</h2></td></tr><tr><td>${inner}</td></tr>`;
}
function card(inner: string) {
  return `<div style="border:1px solid #e1e4ea;border-radius:10px;padding:16px 18px;margin:0 0 12px;background:#ffffff">${inner}</div>`;
}
function draftBox(d: Draft) {
  if (!d.body) return "";
  return `<div style="margin-top:12px;border-left:3px solid #2c44d6;background:#f3f4f7;padding:12px 14px;border-radius:0 8px 8px 0">
    <div style="font-size:12px;color:#676d7c;margin-bottom:6px">Draft email</div>
    <div style="font-weight:600;margin-bottom:8px">${esc(d.subject)}</div>
    <div style="font-size:14px;color:#474d5c">${para(d.body)}</div></div>`;
}

export function renderBriefEmail(data: BriefData): { subject: string; html: string; text: string } {
  const app = (process.env.APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const link = (path: string, label: string) => `<a href="${app}${path}" style="color:#2c44d6;text-decoration:none">${esc(label)}</a>`;
  const g0 = data.guests[0], t0 = data.topics[0], b0 = data.brands[0];
  const highlight = (kicker: string, title: string, sub: string) =>
    `<td valign="top" style="width:33%;padding:0 6px 0 0">${card(`<div style="font-size:11px;color:#2c44d6">${esc(kicker)}</div>
      <div style="font-size:16px;font-weight:600;margin:6px 0 4px">${esc(title)}</div><div style="font-size:13px;color:#676d7c">${esc(sub)}</div>`)}</td>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f3f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14161b;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">
<tr><td><div style="font-size:13px;color:#676d7c">Podcast Radar · weekly brief</div>
<h1 style="margin:4px 0 10px;font-size:24px">Week of ${esc(fmtWeek(data.weekStart))}</h1>
<div style="font-size:15px;color:#474d5c">${para(data.narrative)}</div>
<div style="font-size:12px;color:#676d7c">From ${data.analysedEpisodes} analysed business episodes across ${data.channels} channels.</div></td></tr>
${g0 || t0 || b0 ? `<tr><td style="padding-top:18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${g0 ? highlight("Guest to book", g0.name, g0.why) : ""}${t0 ? highlight("Trending topic", t0.label, t0.why) : ""}${b0 ? highlight("Biggest sponsor", b0.name, b0.why) : ""}
</tr></table></td></tr>` : ""}
${section("Guests to book", data.guests.map((g, i) => card(`
  <div style="font-size:16px;font-weight:600">${i + 1}. ${link(`/guests/${g.id}`, g.name)}</div>
  <div style="font-size:13px;color:#676d7c">${esc(g.headline ?? [g.role, g.company].filter(Boolean).join(", "))}</div>
  <div style="font-size:13px;color:#676d7c;margin:4px 0 8px">${esc(g.why)}</div>
  <div style="font-size:14px">${esc(g.whyNow)}</div>${draftBox(g.draft)}`)).join("") || "<p>No guests ranked this week.</p>")}
${section("Topics to concentrate on", data.topics.map((t, i) => card(`
  <div style="font-size:16px;font-weight:600">${i + 1}. ${link(`/topics/${t.slug}`, t.label)}</div>
  <div style="font-size:13px;color:#676d7c;margin:2px 0 8px">${esc(t.why)}</div>
  ${t.advice ? `<div style="font-size:14px">${esc(t.advice)}</div>` : ""}
  ${t.questions.length ? `<div style="font-size:12px;color:#676d7c;margin-top:10px">Questions your channels covered</div><ul style="margin:4px 0 0;padding-left:18px;font-size:14px;color:#474d5c">${t.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}`)).join("") || "<p>No topics ranked this week.</p>")}
${section("Brands to pitch", data.brands.map((b, i) => card(`
  <div style="font-size:16px;font-weight:600">${i + 1}. ${esc(b.name)}</div>
  <div style="font-size:13px;color:#676d7c;margin:2px 0 8px">${esc(b.why)}</div>
  <div style="font-size:14px">${esc(b.whyNow)}</div>${draftBox(b.draft)}`)).join("") || "<p>No paid placements found this week.</p>")}
${data.topEpisodes.length ? section("Top 3 episodes this week", card(data.topEpisodes.map((e, i) => `
  <div style="margin:${i ? "12px" : "0"} 0 0"><a href="https://www.youtube.com/watch?v=${esc(e.youtubeId)}" style="color:#14161b;font-weight:600;text-decoration:none">${i + 1}. ${esc(e.title)}</a>
  <div style="font-size:13px;color:#676d7c">${esc(e.show)} · ${compact(e.views)} views${e.likes !== null ? ` · ${compact(e.likes)} likes` : ""}${e.comments !== null ? ` · ${compact(e.comments)} comments` : ""}</div></div>`).join(""))) : ""}
<tr><td style="padding:24px 0;font-size:12px;color:#676d7c">Drafts are suggestions. Nothing was sent to any guest or brand. Edit them on the ${link("/pipeline", "Outreach page")}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Week of ${fmtWeek(data.weekStart)}`, "", data.narrative, "",
    "GUESTS TO BOOK", ...data.guests.flatMap((g, i) => [`${i + 1}. ${g.name}: ${g.why}`, `   ${g.whyNow}`, g.draft.body ? `   Draft: ${g.draft.subject}\n${g.draft.body}\n` : ""]),
    "TOPICS", ...data.topics.map((t, i) => `${i + 1}. ${t.label}: ${t.why}${t.advice ? `\n   ${t.advice}` : ""}`), "",
    "BRANDS TO PITCH", ...data.brands.flatMap((b, i) => [`${i + 1}. ${b.name}: ${b.why}`, `   ${b.whyNow}`, b.draft.body ? `   Draft: ${b.draft.subject}\n${b.draft.body}\n` : ""]),
  ].join("\n");

  const subject = `Weekly brief: book ${g0?.name ?? "—"}, cover ${t0?.label ?? "—"}, pitch ${b0?.name ?? "—"}`;
  return { subject, html, text };
}

/** Emails a saved brief to BRIEF_RECIPIENT_EMAIL and marks it emailed. Throws with Resend's message on failure. */
export async function emailBrief(briefId: string): Promise<{ to: string; resendId: string }> {
  const key = process.env.RESEND_API_KEY, to = process.env.BRIEF_RECIPIENT_EMAIL;
  if (!key || !to) throw new Error("RESEND_API_KEY and BRIEF_RECIPIENT_EMAIL must be set");
  const row = (await db().execute({ sql: "select data from briefs where id = ?", args: [briefId] })).rows[0];
  if (!row) throw new Error("Brief not found");
  const { subject, html, text } = renderBriefEmail(JSON.parse(String(row.data)));
  const { data, error } = await new Resend(key).emails.send({
    from: process.env.BRIEF_FROM_EMAIL || "Podcast Radar <onboarding@resend.dev>", to: [to], subject, html, text,
  });
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "no response"}`);
  await db().execute({ sql: "update briefs set emailed = 1 where id = ?", args: [briefId] });
  return { to, resendId: data.id };
}
