import { Suspense } from "react";
import Link from "next/link";
import { ListVideo, Search } from "lucide-react";
import { db } from "@/lib/db";
import { AutoSelect } from "@/components/client";
import {
  EmptyState, PageHeader, PageSkeleton, Panel, ShowName, StatusPill, duration, fmtDate, input, n,
} from "@/components/ui";
import { SourceIcons } from "./sources";

export const metadata = { title: "Episodes" };

type SP = Promise<{ show?: string; kind?: string; q?: string }>;
const LIMIT = 200;

const TABS = [
  { kind: "full", label: "Full episodes" },
  { kind: "clip", label: "Clips" },
  { kind: "trailer", label: "Trailers" },
  { kind: "live_upcoming", label: "Live / upcoming" },
  { kind: "all", label: "All" },
];

export default function EpisodesPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader
        title="Episodes"
        description="Everything collected from YouTube and RSS. Only full episodes go on to AI extraction. Clips and trailers are filtered out so they can't inflate guest counts."
      />
      <div className="mt-8">
        <Suspense fallback={<PageSkeleton />}>
          <Episodes searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Episodes({ searchParams }: { searchParams: SP }) {
  const { show = "", kind = "full", q = "" } = await searchParams;

  const where: string[] = [];
  const args: string[] = [];
  if (show) { where.push("e.show_id = ?"); args.push(show); }
  if (q.trim()) { where.push("e.title like ?"); args.push(`%${q.trim()}%`); }
  const base = where.length ? "where " + where.join(" and ") : "";
  const kindWhere = kind === "all" ? base : `${base ? base + " and" : "where"} e.kind = ?`;
  const kindArgs = kind === "all" ? args : [...args, kind];

  const [shows, counts, list] = await Promise.all([
    db().execute("select id, name from shows order by name"),
    db().execute({ sql: `select e.kind, count(*) c from episodes e ${base} group by e.kind`, args }),
    db().execute({
      sql: `select e.id, e.title, e.published_at, e.duration_seconds, e.kind, e.status,
              e.youtube_video_id, e.rss_guid, e.spotify_episode_id, s.name show_name
            from episodes e join shows s on s.id = e.show_id
            ${kindWhere} order by e.published_at desc limit ${LIMIT}`,
      args: kindArgs,
    }),
  ]);

  const count: Record<string, number> = { all: 0 };
  for (const r of counts.rows) { count[String(r.kind)] = Number(r.c); count.all += Number(r.c); }
  const total = count[kind] ?? 0;
  const href = (k: string) => {
    const p = new URLSearchParams({ kind: k });
    if (show) p.set("show", show);
    if (q) p.set("q", q);
    return `/episodes?${p}`;
  };

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Episode type">
          {TABS.map((t) => {
            const on = t.kind === kind;
            return (
              <Link key={t.kind} href={href(t.kind)} aria-current={on ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  on ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                {t.label}
                <span className={`num text-xs ${on ? "opacity-70" : "text-ink-3"}`}>{n(count[t.kind] ?? 0)}</span>
              </Link>
            );
          })}
        </nav>

        <form className="flex flex-col gap-2 sm:flex-row" role="search">
          <input type="hidden" name="kind" value={kind} />
          <AutoSelect name="show" defaultValue={show} aria-label="Show" className={`${input} sm:w-56`}>
            <option value="">All shows</option>
            {shows.rows.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
          </AutoSelect>
          <label className="relative">
            <span className="sr-only">Search titles</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={q} placeholder="Search titles" className={`${input} w-full pl-9 sm:w-56`} />
          </label>
        </form>
      </div>

      {list.rows.length ? (
        <Panel className="mt-4 overflow-hidden">
          <ul className="divide-y divide-line">
            {list.rows.map((e) => (
              <li key={String(e.id)}>
                <Link href={`/episodes/${e.id}`}
                  className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-5 py-3 transition-colors hover:bg-surface-2/50 md:grid-cols-[3.5rem_minmax(0,1fr)_4.5rem_3.5rem_10rem]">
                  <span className="num text-sm text-ink-3">{fmtDate(e.published_at as string)}</span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium text-ink md:line-clamp-1">{String(e.title)}</span>
                    <ShowName name={String(e.show_name)} className="text-xs text-ink-3" />
                  </span>
                  <span className="num col-start-2 flex items-center gap-3 text-xs text-ink-3 md:col-start-auto md:block md:text-right md:text-sm">
                    {duration(e.duration_seconds as number | null)}
                    <span className="md:hidden"><SourceIcons yt={e.youtube_video_id} rss={e.rss_guid} spotify={e.spotify_episode_id} /></span>
                    <span className="md:hidden"><StatusPill status={String(e.status)} /></span>
                  </span>
                  <span className="hidden md:block"><SourceIcons yt={e.youtube_video_id} rss={e.rss_guid} spotify={e.spotify_episode_id} /></span>
                  <span className="hidden text-right md:block"><StatusPill status={String(e.status)} /></span>
                </Link>
              </li>
            ))}
          </ul>
          {total > LIMIT && (
            <p className="border-t border-line bg-surface-2/50 px-5 py-2.5 text-sm text-ink-3">
              Showing the newest {LIMIT} of {n(total)}. Pick a show or search to narrow it down.
            </p>
          )}
        </Panel>
      ) : (
        <div className="mt-4">
          <EmptyState icon={ListVideo} title="No episodes match">
            {q || show ? "Try another show, clear the search, or switch to the All tab." : "Nothing has been collected yet. Run an ingest from the Runs page."}
          </EmptyState>
        </div>
      )}
    </>
  );
}
