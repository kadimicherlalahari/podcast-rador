import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AlertTriangle, ArrowLeft, ExternalLink, Lightbulb, MessageSquareQuote, PlayCircle, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { compact, computeHighlights } from "@/lib/highlights";
import { readInsight, type EpisodeAnalysis, type GuestProfile, type GuestVideos } from "@/lib/insights";
import { researchGuest } from "@/app/research-actions";
import { ActionButton } from "@/components/client";
import { PageSkeleton, Panel, Pill, Section, ShowName, ago, btn, duration, fmtDate } from "@/components/ui";

// Research runs up to three Gemini/YouTube calls in one action.
export const maxDuration = 300;

type Params = Promise<{ id: string }>;

export default function GuestPage({ params }: { params: Params }) {
  return (
    <>
      <Link href="/rankings?tab=guests" className={`${btn.ghost} -ml-2.5`}><ArrowLeft className="size-4" /> Guests</Link>
      <div className="mt-4">
        <Suspense fallback={<PageSkeleton />}>
          <Guest params={params} />
        </Suspense>
      </div>
    </>
  );
}

const ytTime = (t: string) => t.split(":").reduce((s, p) => s * 60 + Number(p || 0), 0);

async function Guest({ params }: { params: Params }) {
  await connection();
  const { id } = await params;
  const g = (await db().execute({ sql: "select id, canonical_name, company, role from guests where id = ?", args: [id] })).rows[0];
  if (!g) notFound();

  const [eps, profile, videos, h] = await Promise.all([
    db().execute({
      sql: `select e.id, e.title, e.youtube_video_id, e.published_at, e.duration_seconds, e.view_count, e.like_count, e.comment_count,
              s.name show, a.evidence
            from appearances a join episodes e on e.id = a.episode_id join shows s on s.id = e.show_id
            where a.guest_id = ? order by coalesce(e.view_count, 0) desc`,
      args: [id],
    }),
    readInsight<GuestProfile>("guest", id, "profile"),
    readInsight<GuestVideos>("guest", id, "youtube"),
    computeHighlights(),
  ]);
  const topEp = eps.rows.find((e) => e.youtube_video_id);
  const analysis = topEp ? await readInsight<EpisodeAnalysis>("episode", String(topEp.id), "analysis") : null;
  const rank = h.guests.findIndex((x) => x.id === id);
  const ranked = rank >= 0 ? h.guests[rank] : null;
  const p = profile?.payload;
  const a = analysis && !analysis.error ? analysis.payload : null;
  const researched = !!p;

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            {ranked && <Pill tone="accent">#{rank + 1} guest this month</Pill>}
            {ranked && ranked.shows >= 2 && <Pill tone="good">Media rounds</Pill>}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.015em] text-ink">{String(g.canonical_name)}</h1>
          <p className="mt-1 text-[0.95rem] text-ink-2">
            {p?.headline || [g.role, g.company].filter(Boolean).join(", ") || "Role not stated in episode descriptions"}
          </p>
          {ranked && <p className="num mt-2 text-sm text-ink-3">{ranked.why}</p>}
          {(p?.spaces?.length || ranked?.spaces.length) ? (
            <div className="mt-3 flex flex-wrap gap-1.5">{(p?.spaces?.length ? p.spaces : ranked!.spaces).map((s) => <Pill key={s}>{s}</Pill>)}</div>
          ) : null}
        </div>
        <div className="shrink-0">
          <ActionButton action={researchGuest} fields={{ id }}
            variant={researched ? "secondary" : "primary"}
            label={<><Sparkles className="size-4" />{researched ? "Refresh research" : "Research this guest"}</>}
            pending="Researching… about a minute" />
          {profile && <p className="mt-2 text-xs text-ink-3">Researched {ago(profile.generatedAt)}</p>}
        </div>
      </header>

      {p?.identity_confidence === "low" && (
        <p className="mt-6 flex items-start gap-2 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Gemini couldn&apos;t be sure which {String(g.canonical_name)} this is. Check the sources before relying on the profile.
        </p>
      )}

      {!researched && (
        <Panel className="mt-8 p-5 text-sm leading-relaxed text-ink-2">
          No web research yet. <b className="font-medium text-ink">Research this guest</b> reads their Wikipedia page and web and news results,
          has Gemini write a profile from only those pages, finds their other YouTube videos, and watches their most-viewed episode for highlights and quotes.
          The top 10 guests are researched automatically by the daily job.
        </Panel>
      )}

      {p && (
        <Section title="How to approach them">
          <Panel className="p-5">
            <p className="flex items-start gap-2.5 text-ink"><Lightbulb className="mt-0.5 size-4 shrink-0 text-info" />{p.approach.angle}</p>
            {p.approach.talking_points.length > 0 && (
              <>
                <p className="mt-4 text-xs font-medium text-ink-3">Talking points not yet covered</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{p.approach.talking_points.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
            {p.approach.cautions.length > 0 && (
              <>
                <p className="mt-4 text-xs font-medium text-ink-3">Be careful about</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{p.approach.cautions.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
          </Panel>
        </Section>
      )}

      {topEp && (a || analysis?.error) && (
        <Section title={`What they said on ${topEp.show}`}
          description={a ? `Gemini watched the first ${a.minutes} minutes of "${topEp.title}". Times link to that moment on YouTube.` : undefined}>
          {a ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel className="p-5">
                <p className="text-sm leading-relaxed text-ink">{a.summary}</p>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{a.guest_points.map((x) => <li key={x}>{x}</li>)}</ul>
                {a.quotes.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {a.quotes.map((q, i) => (
                      <blockquote key={i} className="border-l-2 border-line-strong pl-3 text-sm text-ink-2">
                        <MessageSquareQuote className="mb-1 size-4 text-ink-3" />
                        &ldquo;{q.quote}&rdquo;
                        <a href={`https://www.youtube.com/watch?v=${topEp.youtube_video_id}&t=${ytTime(q.time)}s`} target="_blank" rel="noreferrer"
                          className="num ml-1 text-xs text-info hover:underline">{q.speaker} · {q.time}</a>
                      </blockquote>
                    ))}
                  </div>
                )}
              </Panel>
              <Panel className="p-5">
                <p className="text-xs font-medium text-ink-3">Highlights</p>
                <ol className="mt-2 space-y-2 text-sm">
                  {a.highlights.map((x, i) => (
                    <li key={i} className="flex gap-3">
                      <a href={`https://www.youtube.com/watch?v=${topEp.youtube_video_id}&t=${ytTime(x.time)}s`} target="_blank" rel="noreferrer"
                        className="num w-12 shrink-0 text-info hover:underline">{x.time}</a>
                      <span className="text-ink-2">{x.point}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>
          ) : (
            <p className="text-sm text-ink-3">Gemini couldn&apos;t watch this video: {analysis?.error}</p>
          )}
        </Section>
      )}

      {p && (
        <Section title="Who they are">
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel className="p-5">
              <p className="text-sm text-ink"><b className="font-medium">{p.current_role}</b>{p.company ? `, ${p.company}` : ""}</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{p.background.map((x) => <li key={x}>{x}</li>)}</ul>
              {p.achievements.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-medium text-ink-3">Notable</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{p.achievements.map((x) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
            </Panel>
            <Panel className="p-5">
              <p className="text-xs font-medium text-ink-3">In the news</p>
              {p.recent_news.length
                ? <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{p.recent_news.map((x) => <li key={x}>{x}</li>)}</ul>
                : <p className="mt-2 text-sm text-ink-3">Nothing recent found.</p>}
              {p.other_appearances.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-medium text-ink-3">Other podcasts and talks</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{p.other_appearances.map((x) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
            </Panel>
          </div>
        </Section>
      )}

      <Section title="On your channels" description="Every episode they appeared in, most viewed first.">
        <Panel>
          <ul className="divide-y divide-line">
            {eps.rows.map((e) => (
              <li key={String(e.id)} className="flex items-center gap-3 px-5 py-3">
                {e.youtube_video_id ? (
                  <a href={`https://www.youtube.com/watch?v=${e.youtube_video_id}`} target="_blank" rel="noreferrer" className="relative shrink-0" aria-label="Watch on YouTube">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://i.ytimg.com/vi/${e.youtube_video_id}/mqdefault.jpg`} alt="" loading="lazy" className="h-[45px] w-20 rounded-lg object-cover" />
                    <PlayCircle className="absolute bottom-1 right-1 size-4 text-white drop-shadow" />
                  </a>
                ) : null}
                <div className="min-w-0 flex-1">
                  <Link href={`/episodes/${e.id}`} className="line-clamp-1 text-sm font-medium text-ink hover:underline">{String(e.title)}</Link>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3"><ShowName name={String(e.show)} /> · {fmtDate(e.published_at as string)} · {duration(e.duration_seconds as number | null)}</span>
                </div>
                <span className="num hidden text-right text-sm text-ink-2 sm:block">
                  {e.view_count === null ? "–" : `${compact(Number(e.view_count))} views`}
                  {e.like_count !== null && <span className="block text-xs text-ink-3">{compact(Number(e.like_count))} likes · {compact(Number(e.comment_count ?? 0))} comments</span>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>

      {videos && videos.payload.videos.length > 0 && (
        <Section title="Their other YouTube content" description={`YouTube search for "${videos.payload.query}", excluding your channels.`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {videos.payload.videos.filter((v) => v.videoId).slice(0, 6).map((v) => (
              <a key={v.videoId} href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-strong">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <span className="block p-3">
                  <span className="line-clamp-2 text-sm font-medium text-ink group-hover:underline">{v.title}</span>
                  <span className="mt-1 block text-xs text-ink-3">{v.channel} · {fmtDate(v.publishedAt)}</span>
                </span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {profile && profile.sources.length > 0 && (
        <Section title="Sources" description="The pages the profile was written from.">
          <ul className="space-y-1 text-sm">
            {profile.sources.map((s) => (
              <li key={s.uri}>
                <a href={s.uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-info hover:underline">
                  {s.title || s.uri}<ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
