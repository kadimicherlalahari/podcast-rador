import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Compass, MessageCircleQuestion, PlayCircle, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { compact, computeHighlights } from "@/lib/highlights";
import { readInsight, type TopicBrief } from "@/lib/insights";
import { writeTopicBrief } from "@/app/research-actions";
import { ActionButton } from "@/components/client";
import { PageSkeleton, Panel, Pill, Section, ShowName, ago, btn, fmtDate } from "@/components/ui";

export const maxDuration = 120;

type Params = Promise<{ slug: string }>;
const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export default function TopicPage({ params }: { params: Params }) {
  return (
    <>
      <Link href="/rankings?tab=topics" className={`${btn.ghost} -ml-2.5`}><ArrowLeft className="size-4" /> Topics</Link>
      <div className="mt-4">
        <Suspense fallback={<PageSkeleton />}>
          <Topic params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function Topic({ params }: { params: Params }) {
  await connection();
  const { slug } = await params;
  const t = (await db().execute({ sql: "select id, slug, label from topics where slug = ?", args: [slug] })).rows[0];
  if (!t) notFound();

  const [eps, brief, h] = await Promise.all([
    db().execute({
      sql: `select e.id, e.title, e.youtube_video_id, e.published_at, e.view_count, e.like_count, e.comment_count, s.name show
            from episode_topics et join episodes e on e.id = et.episode_id join shows s on s.id = e.show_id
            where et.topic_id = ? and e.kind = 'full' and e.status = 'extracted' and coalesce(e.business_related, 1) = 1 and s.active = 1 and e.published_at >= ?
            order by coalesce(e.view_count, 0) desc`,
      args: [String(t.id), daysAgoIso(30)],
    }),
    readInsight<TopicBrief>("topic", slug, "brief"),
    computeHighlights(),
  ]);
  const rank = h.topics.findIndex((x) => x.slug === slug);
  const ranked = rank >= 0 ? h.topics[rank] : null;
  const epById = new Map(eps.rows.map((e) => [String(e.id), e]));
  const b = brief?.payload;

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          {ranked && <Pill tone="accent">#{rank + 1} topic this week</Pill>}
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.015em] text-ink">{String(t.label)}</h1>
          <p className="num mt-1 text-sm text-ink-3">
            {ranked ? ranked.why : `${eps.rows.length} ${eps.rows.length === 1 ? "episode" : "episodes"} in the last 30 days`}
          </p>
          {b && <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">{b.summary}</p>}
        </div>
        {eps.rows.length > 0 && (
          <div className="shrink-0">
            <ActionButton action={writeTopicBrief} fields={{ slug }} variant={b ? "secondary" : "primary"}
              label={<><Sparkles className="size-4" />{b ? "Rewrite brief" : "Write brief"}</>} pending="Writing… about 30 seconds" />
            {brief && <p className="mt-2 text-xs text-ink-3">Written {ago(brief.generatedAt)}</p>}
          </div>
        )}
      </header>

      {!b && (
        <Panel className="mt-8 p-5 text-sm leading-relaxed text-ink-2">
          {eps.rows.length
            ? <>No brief yet. <b className="font-medium text-ink">Write brief</b> has Gemini read these {eps.rows.length} episodes and their top viewer comments,
                and list the questions your channels covered, what viewers are asking, and the angles nobody has taken. The top 6 topics get a brief automatically each day.</>
            : <>No analysed episodes on this topic in the last 30 days.</>}
        </Panel>
      )}

      {b && (
        <>
          <Section title="Top questions your channels covered" description="Only from the episodes below. Each links to the episodes that answer it.">
            <Panel>
              <ol className="divide-y divide-line">
                {b.top_questions.map((q, i) => (
                  <li key={i} className="flex gap-3 px-5 py-3.5">
                    <span className="num w-5 shrink-0 text-sm text-ink-3">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{q.question}</p>
                      <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                        {q.episode_ids.map((id) => {
                          const e = epById.get(id);
                          return e ? (
                            <Link key={id} href={`/episodes/${id}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5 py-1 text-xs text-ink-3 hover:text-ink sm:max-w-xs">
                              <ShowName name={`${e.show}: ${e.title}`} />
                            </Link>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </Section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="What viewers are asking" description="From the top comments, each quoted exactly.">
              {b.audience_questions.length ? (
                <Panel>
                  <ul className="divide-y divide-line">
                    {b.audience_questions.map((q, i) => (
                      <li key={i} className="px-5 py-3.5">
                        <p className="flex items-start gap-2 text-sm font-medium text-ink"><MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-info" />{q.question}</p>
                        <p className="ml-6 mt-1 text-xs italic text-ink-3">&ldquo;{q.comment_quote}&rdquo;</p>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : <p className="text-sm text-ink-3">No clear questions in the comments.</p>}
            </Section>
            <Section title="Key points">
              <Panel className="p-5">
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">{b.key_points.map((x) => <li key={x}>{x}</li>)}</ul>
                {b.gaps.length > 0 && (
                  <>
                    <p className="mt-5 flex items-center gap-1.5 text-xs font-medium text-ink-3"><Compass className="size-3.5" />Angles nobody has covered</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{b.gaps.map((x) => <li key={x}>{x}</li>)}</ul>
                  </>
                )}
              </Panel>
            </Section>
          </div>
        </>
      )}

      {eps.rows.length > 0 && (
        <Section title="Episodes on this topic" description="Last 30 days, most viewed first.">
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
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3"><ShowName name={String(e.show)} /> · {fmtDate(e.published_at as string)}</span>
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
      )}
    </>
  );
}
