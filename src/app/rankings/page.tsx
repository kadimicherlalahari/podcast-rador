import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, GitMerge, Megaphone, TrendingDown, TrendingUp, UserRoundSearch } from "lucide-react";
import { db } from "@/lib/db";
import { computeHighlights } from "@/lib/highlights";
import { TREND_PRESETS } from "@/lib/trends";
import { TrendSearch } from "@/components/trend-search";
import type { EpisodeRef } from "@/lib/score";
import { EmptyState, PageHeader, PageSkeleton, Panel, Pill, ShowName, fmtDate, fmtDateTime } from "@/components/ui";

export const metadata = { title: "Rankings" };
// A fresh trend check makes two YouTube searches and up to two Gemini calls.
export const maxDuration = 120;

type Tab = "guests" | "topics" | "sponsors";
const TABS: { id: Tab; label: string }[] = [
  { id: "guests", label: "Guests" }, { id: "topics", label: "Topics" }, { id: "sponsors", label: "Sponsors" },
];
type SP = Promise<{ tab?: string }>;

export default function RankingsPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader title="Rankings" description="Everyone and everything ranked from the last 30 days of your channels. Open a guest or topic for the full research." />
      <Suspense fallback={<PageSkeleton />}>
        <Rankings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Rankings({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "guests";
  const [h, ready] = await Promise.all([
    computeHighlights(),
    db().execute("select entity_type, entity_id, kind from insights where error is null and kind in ('profile','brief')"),
  ]);
  const has = new Set(ready.rows.map((r) => `${r.entity_type}:${r.entity_id}`));

  return (
    <>
      <nav aria-label="Ranking type" className="mt-6 flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const on = t.id === tab;
          const count = t.id === "guests" ? h.guests.length : t.id === "topics" ? h.topics.length : h.sponsors.length;
          return (
            <Link key={t.id} href={`/rankings?tab=${t.id}`} aria-current={on ? "page" : undefined} scroll={false}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                on ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
              {t.label}<span className="num rounded-full bg-surface-2 px-1.5 text-xs text-ink-3">{count}</span>
            </Link>
          );
        })}
      </nav>
      <p className="mt-3 text-sm text-ink-3">Computed {fmtDateTime(h.scores.asOf)}</p>

      <div className="mt-5">
        {tab === "guests" && (h.guests.length ? (
          <Panel>
            <ol className="divide-y divide-line">
              {h.guests.map((g, i) => (
                <li key={g.id}>
                  <Link href={`/guests/${g.id}`} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50">
                    <span className="num w-5 shrink-0 pt-0.5 text-sm text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-ink">{g.name}</span>
                        {(g.role || g.company) && <span className="text-sm text-ink-3">{[g.role, g.company].filter(Boolean).join(", ")}</span>}
                      </span>
                      <span className="num mt-0.5 block text-sm text-ink-2">{g.why}</span>
                      {g.spaces.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">{g.spaces.map((s) => <Pill key={s}>{s}</Pill>)}</span>
                      )}
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 sm:flex">
                      {g.shows >= 2 && <Pill tone="accent">Media rounds</Pill>}
                      {has.has(`guest:${g.id}`) && <Pill tone="good" dot>Researched</Pill>}
                      <ChevronRight className="size-4 text-ink-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        ) : (
          <EmptyState icon={UserRoundSearch} title="No guests yet">Guests appear once episodes from the last 30 days are extracted.</EmptyState>
        ))}

        {tab === "topics" && <div className="mb-6"><TrendSearch presets={TREND_PRESETS} /></div>}
        {tab === "topics" && (h.topics.length ? (
          <Panel>
            <ol className="divide-y divide-line">
              {h.topics.map((t, i) => (
                <li key={t.slug}>
                  <Link href={`/topics/${t.slug}`} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50">
                    <span className="num w-5 shrink-0 pt-0.5 text-sm text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-ink">{t.label}</span>
                      <span className="num mt-0.5 block text-sm text-ink-2">{t.why}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Trend trend={t.trend} />
                      {has.has(`topic:${t.slug}`) && <span className="hidden sm:inline"><Pill tone="good" dot>Brief ready</Pill></span>}
                      <ChevronRight className="size-4 text-ink-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        ) : (
          <EmptyState icon={TrendingUp} title="Not enough tagged episodes">A topic needs at least 2 episodes in the last 5 weeks to be ranked.</EmptyState>
        ))}

        {tab === "sponsors" && (h.sponsors.length ? (
          <>
            <p className="mb-3 text-sm text-ink-3">
              Paid ad reads and sponsor disclosures in the last {h.scores.weights.sponsorWindowDays} days. Score = shows × {h.scores.weights.shows} + placements × {h.scores.weights.placements} + up to {h.scores.weights.recency} for recency.
            </p>
            <Panel>
              <ol className="divide-y divide-line">
                {h.sponsors.map((b, i) => (
                  <li key={b.id} className="px-5 py-4">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start gap-4">
                        <span className="num w-5 shrink-0 pt-0.5 text-sm text-ink-3">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-ink">{b.name}</span>
                          <span className="num mt-0.5 block text-sm text-ink-2">{b.why}</span>
                        </span>
                        <span className="num shrink-0 text-sm font-bold text-ink">{b.score}</span>
                      </summary>
                      <Episodes episodes={b.episodes} />
                    </details>
                  </li>
                ))}
              </ol>
            </Panel>
          </>
        ) : (
          <EmptyState icon={Megaphone} title="No paid placements found">No ad reads or sponsor disclosures in the window.</EmptyState>
        ))}
      </div>

      <Suspense><Merges /></Suspense>
    </>
  );
}

function Trend({ trend }: { trend: string }) {
  if (trend === "rising") return <Pill tone="good"><TrendingUp className="size-3" /> Rising</Pill>;
  if (trend === "falling") return <Pill tone="bad"><TrendingDown className="size-3" /> Falling</Pill>;
  if (trend === "new") return <Pill tone="accent">New</Pill>;
  return <Pill>Steady</Pill>;
}

async function Merges() {
  const { rows } = await db().execute("select entity_type, a_name, b_name, method, verdict, reason from entity_decisions order by created_at desc limit 40");
  if (!rows.length) return null;
  return (
    <details className="mt-10">
      <summary className="flex cursor-pointer items-center gap-2 text-sm text-ink-3"><GitMerge className="size-4" />How duplicate names were merged ({rows.length})</summary>
      <Panel className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <tbody className="divide-y divide-line">
            {rows.map((d, i) => (
              <tr key={i} className="align-top text-ink-2">
                <td className="px-5 py-2.5">{d.verdict === "merged" ? <Pill tone="good">Merged</Pill> : <Pill>Kept apart</Pill>}</td>
                <td className="py-2.5 text-ink">{String(d.a_name)} <span className="text-ink-3">/</span> {String(d.b_name)}
                  <span className="block text-xs text-ink-3">{d.entity_type === "guest" ? "Guest" : "Brand"} · {d.method === "gemini" ? "checked by Gemini" : "near-identical spelling"}</span>
                </td>
                <td className="max-w-md px-5 py-2.5 text-xs text-ink-3">{String(d.reason ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </details>
  );
}

const MENTION: Record<string, string> = { paid_read: "Ad read", sponsor_disclosure: "Sponsor" };

function Episodes({ episodes }: { episodes: EpisodeRef[] }) {
  return (
    <ul className="ml-9 mt-3 space-y-1.5 border-l border-line pl-4 text-sm">
      {episodes.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
          <ShowName name={e.show} className="text-xs text-ink-3" />
          <Link href={`/episodes/${e.id}`} className="min-w-0 flex-1 text-ink-2 hover:text-ink hover:underline">{e.title}</Link>
          {e.mentionType && <Pill>{MENTION[e.mentionType] ?? e.mentionType}</Pill>}
          <span className="num text-xs text-ink-3">{fmtDate(e.publishedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
