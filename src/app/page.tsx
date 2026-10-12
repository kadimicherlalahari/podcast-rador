import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Check, CircleDashed, Hourglass, Megaphone, Send, TrendingUp, UserRoundSearch } from "lucide-react";
import { db } from "@/lib/db";
import {
  Panel, PageHeader, PageSkeleton, Pill, Section, ShowName, TextLink,
  ago, duration, fmtDate, n, weekLabel, btn,
} from "@/components/ui";

const WEEKS = 8;
const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  await connection();
  const [shows, weekly, totals, runs, briefs, latest] = await Promise.all([
    db().execute({
      sql: `select s.id, s.name, s.active, s.host_names,
              coalesce(sum(e.kind = 'full' and e.published_at >= ?), 0) full_30d,
              max(case when e.kind = 'full' then e.published_at end) latest_full
            from shows s left join episodes e on e.show_id = s.id group by s.id order by s.active desc, s.name`,
      args: [daysAgoIso(30)],
    }),
    db().execute({
      sql: `select show_id, cast((julianday('now') - julianday(published_at)) / 7 as integer) wk, count(*) c
            from episodes where kind = 'full' and published_at >= ? group by 1, 2`,
      args: [daysAgoIso(WEEKS * 7)],
    }),
    db().execute(`select count(*) total, coalesce(sum(kind = 'full'), 0) full_eps,
                    coalesce(sum(status = 'pending_extraction'), 0) pending,
                    coalesce(sum(status = 'extracted'), 0) extracted,
                    count(distinct case when kind = 'full' then show_id end) shows_with_full
                  from episodes`),
    db().execute("select started_at, finished_at, errors from ingest_runs order by started_at desc limit 1"),
    db().execute("select id, week_start, generated_at from briefs order by generated_at desc limit 1"),
    db().execute(`select e.id, e.title, e.published_at, e.duration_seconds, s.name show_name
                  from episodes e join shows s on s.id = e.show_id
                  where e.kind = 'full' order by e.published_at desc limit 6`),
  ]);

  const t = totals.rows[0];
  const run = runs.rows[0];
  const brief = briefs.rows[0];
  const runErrors = run ? (JSON.parse(String(run.errors)) as string[]).length : 0;
  const pending = Number(t.pending), extracted = Number(t.extracted);

  const bars = new Map<string, number[]>();
  for (const r of weekly.rows) {
    const arr = bars.get(String(r.show_id)) ?? Array(WEEKS).fill(0);
    const wk = Number(r.wk);
    if (wk >= 0 && wk < WEEKS) arr[WEEKS - 1 - wk] = Number(r.c);
    bars.set(String(r.show_id), arr);
  }
  const peak = Math.max(1, ...[...bars.values()].flat());

  const summary = brief ? (
    <>Your latest brief is ready. Open it to see who to book, what to cover and who to pitch.</>
  ) : extracted === 0 ? (
    <>No brief yet. <b className="font-medium text-ink">{n(pending)} full episodes</b> from {n(t.shows_with_full)} shows
      are collected and waiting for AI extraction, which is the next stage.</>
  ) : (
    <>No brief yet. {n(extracted)} episodes are extracted; the brief is written once scoring is in place.</>
  );

  type Step = { label: string; detail: string; state: "done" | "waiting" | "todo" };
  const steps: Step[] = [
    {
      label: "Collect episodes",
      detail: run ? `${n(t.total)} items · last run ${ago(String(run.started_at))}` : "No run yet",
      state: run ? "done" : "waiting",
    },
    {
      label: "Extract guests, topics, sponsors",
      detail: extracted ? `${n(extracted)} done · ${n(pending)} waiting` : `${n(pending)} episodes waiting`,
      state: pending && !extracted ? "waiting" : extracted ? "done" : "todo",
    },
    { label: "Score and rank", detail: "Media rounds, topic momentum, sponsors", state: "todo" },
    { label: "Write the brief", detail: "Every Monday morning", state: brief ? "done" : "todo" },
    { label: "Draft outreach", detail: "Top 5 guests and brands", state: "todo" },
  ];

  return (
    <>
      <PageHeader
        title={`Week of ${weekLabel()}`}
        description={summary}
        actions={brief ? (
          <Link className={btn.primary} href={`/briefs/${brief.id}`}>Open latest brief</Link>
        ) : (
          <Link className={btn.secondary} href="/admin/runs">View runs</Link>
        )}
      />

      <Panel className="mt-8 overflow-hidden">
        <ol className="grid divide-y divide-line sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {steps.map((s) => (
            <li key={s.label} className="flex gap-3 p-4 sm:flex-col sm:gap-2.5">
              <StepIcon state={s.state} />
              <div>
                <p className={`text-sm font-medium ${s.state === "todo" ? "text-ink-2" : "text-ink"}`}>{s.label}</p>
                <p className="num mt-0.5 text-xs leading-snug text-ink-3">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {runErrors > 0 && (
          <Link href="/admin/runs" className="block border-t border-line bg-bad-soft px-4 py-2 text-sm text-bad hover:underline">
            The last run reported {runErrors} {runErrors === 1 ? "error" : "errors"}. See details.
          </Link>
        )}
      </Panel>

      <Section title="What Monday's brief answers" description="Each answer links back to the episodes it came from.">
        <Panel>
          <ul className="divide-y divide-line">
            {[
              { icon: UserRoundSearch, q: "Who to book", a: "Guests on 2+ of your monitored shows in the last 30 days, plus early guests seen on just one." },
              { icon: TrendingUp, q: "What to cover", a: "Topics rising or falling this week compared with the previous 4 weeks." },
              { icon: Megaphone, q: "Who to pitch for sponsorship", a: "Brands with paid ad reads across shows, ranked by spread and recency." },
              { icon: Send, q: "Outreach drafts", a: "Editable pitches for the top guests and brands. Nothing is sent automatically." },
            ].map(({ icon: Icon, q, a }) => (
              <li key={q} className="flex items-start gap-4 px-5 py-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{q}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{a}</p>
                </div>
                <span className="hidden sm:block">
                  {brief ? <Pill tone="good">Ready</Pill> : <Pill>Needs extraction</Pill>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>

      <Section
        title="Monitored shows"
        description={`Full episodes per week over the last ${WEEKS} weeks. Clips and trailers are not counted.`}
        action={<TextLink href="/admin/shows">Manage</TextLink>}
      >
        <Panel className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7.5rem_5rem] gap-4 border-b border-line bg-surface-2/60 px-5 py-2 text-xs font-medium text-ink-3 md:grid">
            <span>Show</span><span>Last {WEEKS} weeks</span><span className="text-right">Last 30 days</span><span className="text-right">Latest</span>
          </div>
          <ul className="divide-y divide-line">
            {shows.rows.map((s) => {
              const active = s.active === 1;
              const full30 = Number(s.full_30d);
              const series = bars.get(String(s.id)) ?? Array(WEEKS).fill(0);
              const hosts = (JSON.parse(String(s.host_names ?? "[]")) as string[]).join(", ");
              return (
                <li key={String(s.id)}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7.5rem_5rem] ${active ? "" : "bg-surface-2/40"}`}>
                  <div className="min-w-0">
                    <Link href={`/episodes?show=${s.id}`} className="block font-medium text-ink hover:underline">
                      <ShowName name={String(s.name)} />
                    </Link>
                    <p className="ml-4 truncate text-xs text-ink-3">{hosts || "Host not set"}</p>
                  </div>
                  <div className="order-last col-span-2 md:order-none md:col-span-1">
                    {active ? (
                      <div className="flex h-7 items-end gap-1" role="img"
                        aria-label={`Full episodes per week, oldest first: ${series.join(", ")}`}>
                        {series.map((c, i) => (
                          <span key={i} className="flex-1 rounded-[3px]"
                            style={{
                              height: c ? `${Math.max(18, (c / peak) * 100)}%` : "3px",
                              background: c ? "var(--ink-2)" : "var(--bar-empty)",
                              opacity: c ? 0.55 + 0.45 * (i / (WEEKS - 1)) : 1,
                            }} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-3">Not monitored</span>
                    )}
                  </div>
                  <div className="text-right">
                    {!active ? <Pill>Paused</Pill>
                      : full30 === 0 ? <Pill tone="warn" dot>Quiet</Pill>
                      : <span className="num text-sm text-ink"><b className="font-semibold">{full30}</b> <span className="text-ink-3">{full30 === 1 ? "episode" : "episodes"}</span></span>}
                  </div>
                  <span className="num hidden text-right text-sm text-ink-2 md:block">{fmtDate(s.latest_full as string | null)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </Section>

      <Section title="Latest full episodes" action={<TextLink href="/episodes">All episodes</TextLink>}>
        <Panel>
          <ul className="divide-y divide-line">
            {latest.rows.map((e) => (
              <li key={String(e.id)}>
                <Link href={`/episodes/${e.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2/50">
                  <span className="num w-14 shrink-0 text-sm text-ink-3">{fmtDate(e.published_at as string)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{String(e.title)}</span>
                    <ShowName name={String(e.show_name)} className="text-xs text-ink-3" />
                  </span>
                  <span className="num hidden text-sm text-ink-3 sm:block">{duration(e.duration_seconds as number | null)}</span>
                </Link>
              </li>
            ))}
            {!latest.rows.length && <li className="px-5 py-6 text-sm text-ink-3">No full episodes collected yet. Run an ingest from the Runs page.</li>}
          </ul>
        </Panel>
      </Section>
    </>
  );
}

function StepIcon({ state }: { state: "done" | "waiting" | "todo" }) {
  if (state === "done") return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-good text-surface"><Check className="size-3.5" strokeWidth={2.5} /></span>;
  if (state === "waiting") return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-soft-ink"><Hourglass className="size-3.5" strokeWidth={2} /></span>;
  return <span className="grid size-6 shrink-0 place-items-center rounded-full text-ink-3"><CircleDashed className="size-5" strokeWidth={1.5} /></span>;
}

