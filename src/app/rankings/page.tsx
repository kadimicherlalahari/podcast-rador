import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { GitMerge, Megaphone, Sparkles, TrendingDown, TrendingUp, UserRoundSearch } from "lucide-react";
import { db } from "@/lib/db";
import { computeScores, type EpisodeRef, type GuestRank } from "@/lib/score";
import { EmptyState, PageHeader, PageSkeleton, Panel, Pill, Section, ShowName, TextLink, ago, fmtDate, fmtDateTime } from "@/components/ui";

export const metadata = { title: "Rankings" };

export default function RankingsPage() {
  return (
    <>
      <PageHeader
        title="Rankings"
        description="Live scores from every extracted episode, worked out with plain SQL each time this page loads. Monday's brief is built from these."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Rankings />
      </Suspense>
    </>
  );
}

const EARLY_SHOWN = 12;

async function Rankings() {
  await connection();
  const [s, decisions, lastRun] = await Promise.all([
    computeScores(),
    db().execute("select entity_type, a_name, b_name, method, verdict, reason, created_at from entity_decisions order by created_at desc limit 40"),
    db().execute("select finished_at, merged, pending from resolve_runs order by started_at desc limit 1"),
  ]);
  const run = lastRun.rows[0];

  return (
    <>
      <p className="mt-3 text-sm text-ink-3">
        Week of {fmtDate(s.weekStart, { day: "numeric", month: "long" })} · computed {fmtDateTime(s.asOf)}
        {" · "}{run ? <>names last de-duplicated {ago(String(run.finished_at))}</> : <>names not de-duplicated yet, run <TextLink href="/admin/runs">Score and rank</TextLink></>}
      </p>

      <Section title="Who to book: media rounds" description="Guests on two or more of your shows in the last 30 days, most shows first.">
        {s.mediaRounds.length ? (
          <GuestList guests={s.mediaRounds} metric={(g) => <><b className="font-semibold text-ink">{g.shows}</b> shows · {g.appearances} {g.appearances === 1 ? "episode" : "episodes"}</>} />
        ) : (
          <EmptyState icon={UserRoundSearch} title="No guest is on two shows yet">
            No one has appeared on more than one monitored show in the last 30 days. This fills in as more episodes are extracted.
          </EmptyState>
        )}
      </Section>

      <Section title="Who to book: early guests"
        description={`Seen exactly once in all our data, in the last 30 days. Newest first${s.earlyGuests.length > EARLY_SHOWN ? `, showing ${EARLY_SHOWN} of ${s.earlyGuests.length}` : ""}.`}>
        {s.earlyGuests.length ? (
          <GuestList guests={s.earlyGuests.slice(0, EARLY_SHOWN)} metric={(g) => fmtDate(g.lastSeen)} />
        ) : (
          <EmptyState icon={Sparkles} title="No early guests">No first-time guests in the last 30 days.</EmptyState>
        )}
      </Section>

      <Section title="What to cover: topic momentum"
        description="Episodes tagged this week against the average week over the 4 weeks before. Topics with fewer than 2 episodes in that time are hidden.">
        {s.topics.length ? (
          <Panel className="overflow-x-auto">
            <table className="num w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-5 py-2 font-medium">Topic</th>
                  <th className="py-2 text-right font-medium">Last 7 days</th>
                  <th className="py-2 text-right font-medium">Avg week before</th>
                  <th className="py-2 text-right font-medium">Ratio</th>
                  <th className="px-5 py-2 text-right font-medium">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {s.topics.map((t) => (
                  <tr key={t.slug} className="text-ink-2">
                    <td className="px-5 py-2.5 text-ink">{t.label}</td>
                    <td className="py-2.5 text-right font-medium text-ink">{t.thisWeek}</td>
                    <td className="py-2.5 text-right">{t.priorAvg}</td>
                    <td className="py-2.5 text-right">{t.ratio === null ? "–" : `${t.ratio}×`}</td>
                    <td className="px-5 py-2.5 text-right">
                      {t.trend === "rising" ? <Pill tone="good"><TrendingUp className="size-3" /> Rising</Pill>
                        : t.trend === "falling" ? <Pill tone="bad"><TrendingDown className="size-3" /> Falling</Pill>
                        : t.trend === "new" ? <Pill tone="accent">New</Pill>
                        : <Pill>Steady</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ) : (
          <EmptyState icon={TrendingUp} title="Not enough tagged episodes">Topic momentum needs at least 2 episodes per topic in the last 5 weeks.</EmptyState>
        )}
      </Section>

      <Section title="Who to pitch: active sponsors"
        description={<>Paid ad reads and sponsor disclosures in the last {s.weights.sponsorWindowDays} days. Score = shows × {s.weights.shows} + placements × {s.weights.placements} + up to {s.weights.recency} for recency (halves every {s.weights.halflifeDays} days).</>}>
        {s.sponsors.length ? (
          <Panel>
            <ul className="divide-y divide-line">
              {s.sponsors.slice(0, 15).map((b, i) => (
                <li key={b.id} className="px-5 py-3.5">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-baseline gap-3">
                      <span className="num w-5 shrink-0 text-sm text-ink-3">{i + 1}</span>
                      <span className="min-w-0 flex-1 font-medium text-ink">{b.name}</span>
                      <span className="num text-sm text-ink-2">{b.shows} {b.shows === 1 ? "show" : "shows"} · {b.placements} {b.placements === 1 ? "placement" : "placements"} · last {fmtDate(b.lastSeen)}</span>
                      <span className="num w-12 text-right text-sm font-semibold text-ink">{b.score}</span>
                    </summary>
                    <Episodes episodes={b.episodes} />
                  </details>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <EmptyState icon={Megaphone} title="No paid placements found">No ad reads or sponsor disclosures in the window.</EmptyState>
        )}
      </Section>

      <Section title="Name merges" description="Near-identical names merge on their own. Borderline pairs are checked by Gemini, and both its yes and no answers are kept so a pair is never asked twice.">
        {decisions.rows.length ? (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <tbody className="divide-y divide-line">
                {decisions.rows.map((d, i) => (
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
        ) : (
          <EmptyState icon={GitMerge} title="No merges yet">Run Score and rank on the Runs page to de-duplicate guest and brand names.</EmptyState>
        )}
      </Section>
    </>
  );
}

function GuestList({ guests, metric }: { guests: GuestRank[]; metric: (g: GuestRank) => React.ReactNode }) {
  return (
    <Panel>
      <ul className="divide-y divide-line">
        {guests.map((g) => (
          <li key={g.id} className="px-5 py-3.5">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{g.name}</span>
                  {(g.company || g.role) && <span className="ml-2 text-sm text-ink-3">{[g.role, g.company].filter(Boolean).join(", ")}</span>}
                </span>
                <span className="num text-sm text-ink-2">{metric(g)}</span>
              </summary>
              <Episodes episodes={g.episodes} />
            </details>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const MENTION: Record<string, string> = { paid_read: "Ad read", sponsor_disclosure: "Sponsor" };

function Episodes({ episodes }: { episodes: EpisodeRef[] }) {
  return (
    <ul className="mt-2.5 space-y-1.5 border-l border-line pl-4 text-sm">
      {episodes.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
          <ShowName name={e.show} className="text-xs text-ink-3" />
          <Link href={`/episodes/${e.id}`} className="min-w-0 flex-1 text-ink-2 hover:text-ink hover:underline">{e.title}</Link>
          {e.mentionType && <Pill>{MENTION[e.mentionType] ?? e.mentionType}</Pill>}
          <span className="num text-xs text-ink-3">{fmtDate(e.publishedAt)}</span>
        </li>
      ))}
      {!episodes.length && <li className="text-ink-3">No episodes</li>}
    </ul>
  );
}
