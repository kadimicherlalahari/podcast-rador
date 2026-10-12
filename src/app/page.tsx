import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowDown, ArrowRight, ArrowUp, ChevronRight, ClipboardList, FileText, Hash, Megaphone, Mic, Play,
  RadioTower, Send, Tag, TrendingUp, UsersRound, type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  compact, computeHighlights, recentActivity, weekStats,
  type Activity, type Highlights, type RankedGuest, type RankedSponsor, type RankedTopic, type WeekStat,
} from "@/lib/highlights";
import { readInsight, type EpisodeAnalysis } from "@/lib/insights";
import { writeAndSendBrief } from "@/app/research-actions";
import { ActionButton } from "@/components/client";
import { ChannelManager, type ChannelRow } from "@/components/channel-manager";
import { EmptyState, PageSkeleton, Panel, Pill, ago, duration, fmtDate, n, showColor } from "@/components/ui";

// Writing the brief from the header button runs Gemini once and sends one email.
export const maxDuration = 120;

const TZ = "Asia/Kolkata";
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
  const [h, stats, activity, shows, totals, brief] = await Promise.all([
    computeHighlights(),
    weekStats(),
    recentActivity(),
    db().execute({
      sql: `select s.id, s.name, s.active, s.youtube_channel_id,
              coalesce(sum(e.kind = 'full' and e.published_at >= ?), 0) full_30d,
              max(case when e.kind = 'full' then e.published_at end) latest
            from shows s left join episodes e on e.show_id = s.id group by s.id order by s.name`,
      args: [daysAgoIso(30)],
    }),
    db().execute(`select coalesce(sum(kind = 'full' and status = 'extracted' and business_related = 1), 0) analysed,
                    coalesce(sum(kind = 'full' and status = 'pending_extraction'), 0) pending from episodes`),
    db().execute("select generated_at, emailed from briefs order by generated_at desc limit 1"),
  ]);
  const channels: ChannelRow[] = shows.rows.map((s) => ({
    id: String(s.id), name: String(s.name), active: s.active === 1, channelId: (s.youtube_channel_id as string) || null,
    episodes30d: Number(s.full_30d), latest: (s.latest as string) || null,
  }));
  const activeCount = channels.filter((c) => c.active).length;
  const analysed = Number(totals.rows[0].analysed), pending = Number(totals.rows[0].pending);
  const top = h.topEpisodes[0];
  const [featured, featuredTopics] = top ? await Promise.all([
    readInsight<EpisodeAnalysis>("episode", top.id, "analysis"),
    db().execute({ sql: "select t.label from episode_topics et join topics t on t.id = et.topic_id where et.episode_id = ? and t.slug != 'other'", args: [top.id] }),
  ]) : [null, null];

  const hour = Number(new Date().toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const lastBrief = brief.rows[0];
  const rounds = h.guests.filter((g) => g.shows >= 2).length;
  const topicScale = Math.max(1, ...h.topics.slice(0, 5).flatMap((t) => [t.thisWeek, t.priorAvg]));

  return (
    <div className="grid grid-cols-1 gap-6 min-[87.5rem]:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {/* Greeting */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-violet-soft text-xl font-medium text-violet" aria-hidden>A</span>
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.015em] text-ink">{greeting}, Aditya</h1>
              <p className="mt-0.5 text-[0.95rem] text-ink-3">Here&apos;s what&apos;s happening across your {activeCount} channels this week.</p>
              <p className="num mt-1 text-xs text-ink-3">{today} · YouTube stats updated {ago(h.statsUpdatedAt)}</p>
            </div>
          </div>
          <div className="shrink-0">
            <ActionButton action={writeAndSendBrief} fields={{}} pending="Writing and emailing…"
              label={<><FileText className="size-4" />Write &amp; email weekly brief</>} />
          </div>
        </section>

        {/* Week at a glance */}
        <section aria-label="This week compared with last week" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Mic} tone="violet" label="New episodes" stat={stats.episodes} />
          <Stat icon={UsersRound} tone="good" label="Unique guests" stat={stats.guests} />
          <Stat icon={TrendingUp} tone="info" label="Trending topics" stat={stats.trending} />
          <Stat icon={Tag} tone="accent" label="Sponsor mentions" stat={stats.sponsorMentions} />
        </section>

        {/* The three decisions */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <RankCard title="Top guest opportunities" href="/rankings?tab=guests" empty="No guests extracted yet."
            note={rounds ? `${rounds} ${rounds === 1 ? "guest is" : "guests are"} on 2+ of your channels (media rounds). The rest are ranked by views.`
              : "Nobody is on 2+ of your channels yet, so these are ranked by views. High means 500K+ views in 30 days."}>
            {h.guests.slice(0, 5).map((g, i) => <GuestRow key={g.id} g={g} i={i} />)}
          </RankCard>
          <RankCard title="Trending topics" href="/rankings?tab=topics" empty="Not enough tagged episodes yet."
            note={<span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-info" />Episodes, last 7 days</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 rounded-full bg-ink" />Average week before</span>
            </span>}>
            {h.topics.slice(0, 5).map((t, i) => <TopicRow key={t.slug} t={t} i={i} scale={topicScale} />)}
          </RankCard>
          <RankCard title="Potential sponsors" href="/rankings?tab=sponsors" empty="No paid placements found yet."
            note={h.sponsors.length > 5 ? `${h.sponsors.length - 5} more brands paid for placements in the last ${h.scores.weights.sponsorWindowDays} days.`
              : `Paid ad reads and sponsor disclosures in the last ${h.scores.weights.sponsorWindowDays} days.`}>
            {h.sponsors.slice(0, 5).map((b, i) => <SponsorRow key={b.id} b={b} i={i} />)}
          </RankCard>
        </section>

        {/* Narrower screens: highlights stay near the top as a row instead of a side column. */}
        <section className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3 min-[87.5rem]:hidden">
          <Rail h={h} activity={activity} />
        </section>

        {/* Brief + episodes */}
        <section className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          <Panel className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-soft-ink"><FileText className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-ink">Weekly brief</h2>
                  {lastBrief && <Pill tone={lastBrief.emailed === 1 ? "good" : "neutral"}>{lastBrief.emailed === 1 ? "Emailed" : "Written"}</Pill>}
                </div>
                <p className="mt-0.5 text-sm text-ink-3">Emailed to you with a draft for each guest and brand.</p>
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {[
                { icon: UsersRound, q: "Who should I invite?", a: h.guests.slice(0, 3).map((g) => g.name).join(", ") || "Nothing ranked yet" },
                { icon: Hash, q: "What should I talk about?", a: h.topics.slice(0, 3).map((t) => t.label).join(", ") || "Nothing ranked yet" },
                { icon: Megaphone, q: "Who should I pitch?", a: h.sponsors.slice(0, 3).map((b) => b.name).join(", ") || "Nothing ranked yet" },
              ].map(({ icon: Icon, q, a }) => (
                <li key={q} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-violet-soft text-violet"><Icon className="size-3.5" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{q}</span>
                    <span className="block text-sm text-ink-3">{a}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 pt-5">
              <Link href="/pipeline" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap py-1.5 text-sm font-medium text-info hover:underline">Outreach drafts <ArrowRight className="size-3.5" /></Link>
              <span className="text-xs text-ink-3">{lastBrief ? `Last written ${ago(String(lastBrief.generated_at))}` : "Not written yet"}</span>
            </div>
          </Panel>

          <Panel className="flex flex-col">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="truncate font-bold text-ink">Top episodes this week</h2>
              <Link href="/episodes" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap py-1.5 text-sm font-medium text-info hover:underline">View all <ArrowRight className="size-3.5" /></Link>
            </div>
            {h.topEpisodes.length ? (
              <ol className="px-2 pb-2">
                {h.topEpisodes.slice(0, 3).map((e, i) => (
                  <li key={e.id}>
                    <Link href={`/episodes/${e.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2">
                      <span className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`https://i.ytimg.com/vi/${e.youtubeId}/mqdefault.jpg`} alt="" loading="lazy" className="h-[54px] w-24 rounded-lg object-cover" />
                        <span className="num absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[0.65rem] font-medium text-white">{duration(e.durationSeconds)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-medium leading-snug text-ink">{e.title}</span>
                        <span className="num mt-0.5 block truncate text-xs text-ink-3">{e.show} · {compact(e.views)} views · #{i + 1}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <p className="px-5 pb-5 text-sm text-ink-3">No business episodes with stats in the last 7 days.</p>}
            <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">
              Ranked by (views + {h.weights.like} × likes + {h.weights.comment} × comments) per day since release.
            </p>
          </Panel>

          {top ? (
            <Panel className="overflow-hidden">
              <a href={`https://www.youtube.com/watch?v=${top.youtubeId}`} target="_blank" rel="noreferrer" className="group relative block" aria-label={`Watch ${top.title} on YouTube`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${top.youtubeId}/hqdefault.jpg`} alt="" className="aspect-video w-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/15">
                  <span className="grid size-12 place-items-center rounded-full bg-black/70 text-white transition-transform group-hover:scale-105"><Play className="size-5 translate-x-px fill-current" /></span>
                </span>
                <span className="num absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">{duration(top.durationSeconds)}</span>
              </a>
              <div className="p-4">
                <Link href={`/episodes/${top.id}`} className="line-clamp-2 font-medium leading-snug text-ink hover:underline">{top.title}</Link>
                <p className="num mt-1 text-xs text-ink-3">{top.show} · most watched this week · {fmtDate(top.publishedAt)} · {compact(top.views)} views</p>
                {featuredTopics && featuredTopics.rows.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">{featuredTopics.rows.map((t) => <Pill key={String(t.label)}>{String(t.label)}</Pill>)}</div>
                )}
                {featured && !featured.error && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-2">{featured.payload.summary}</p>}
              </div>
            </Panel>
          ) : (
            <EmptyState icon={Play} title="No episodes this week">The most-watched episode of the week shows here.</EmptyState>
          )}
        </section>

        {/* Channels */}
        <section id="channels" className="scroll-mt-20">
          <div className="mb-3">
            <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">Your channels</h2>
            <p className="mt-0.5 text-sm text-ink-3">Add a channel by its link, @handle or channel ID. Removing one stops tracking it and keeps its history.</p>
          </div>
          <ChannelManager channels={channels} />
        </section>

        <p className="text-xs text-ink-3">
          Based on {n(analysed)} analysed business episodes{pending ? `, ${n(pending)} waiting` : ""}. Every number comes from your channels&apos; real episodes.
        </p>
      </div>

      {/* Beside the main column from 1400px (87.5rem). Below that it sits under the ranked lists instead (see above). */}
      <aside className="hidden min-[87.5rem]:block min-[87.5rem]:space-y-3">
        <Rail h={h} activity={activity} />
      </aside>
    </div>
  );
}

// ---------- pieces ----------

function Rail({ h, activity }: { h: Highlights; activity: Activity[] }) {
  return (
    <>
    <Panel>
      <h2 className="flex items-center gap-2 px-5 pb-1 pt-4 font-bold text-ink">
        <svg viewBox="0 0 28 20" className="h-3.5 w-5" aria-hidden><rect width="28" height="20" rx="5.5" className="fill-accent" /><path d="M11.2 6.1v7.8l6.6-3.9z" fill="#fff" /></svg>
        This week&apos;s highlights
      </h2>
      <ul className="divide-y divide-line px-2 pb-2">
        <RailItem icon={UsersRound} tone="violet" href={h.guests[0] ? `/guests/${h.guests[0].id}` : "/rankings?tab=guests"}
          title={h.guests[0] ? `Book ${h.guests[0].name}` : "No guest to book yet"} sub={h.guests[0]?.why ?? "Guests appear once episodes are analysed."} />
        <RailItem icon={TrendingUp} tone="good" href={h.topics[0] ? `/topics/${h.topics[0].slug}` : "/rankings?tab=topics"}
          title={h.topics[0] ? `${h.topics[0].label} is trending` : "No trending topic yet"} sub={h.topics[0]?.why ?? "Topics need 2+ episodes to rank."} />
        <RailItem icon={Tag} tone="accent" href="/rankings?tab=sponsors"
          title={h.sponsors[0] ? `${h.sponsors[0].name} is a potential sponsor` : "No sponsor found yet"} sub={h.sponsors[0]?.why ?? "Paid placements show here."} />
      </ul>
    </Panel>

    <Panel>
      <h2 className="px-5 pb-1 pt-4 font-bold text-ink">Quick access</h2>
      <ul className="px-2 pb-2">
        {[
          { icon: RadioTower, label: "Manage channels", href: "#channels" },
          { icon: TrendingUp, label: "Check if a topic is trending", href: "/rankings?tab=topics" },
          { icon: Send, label: "Outreach drafts", href: "/pipeline" },
          { icon: ClipboardList, label: "Run collection or research", href: "/admin/runs" },
        ].map(({ icon: Icon, label, href }) => (
          <li key={label}>
            <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink transition-colors hover:bg-surface-2">
              <Icon className="size-[18px] text-ink-2" strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>

    <Panel>
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="font-bold text-ink">Recent activity</h2>
        <Link href="/admin/runs" className="inline-flex items-center gap-1 py-1.5 text-sm font-medium text-info hover:underline">View all <ArrowRight className="size-3.5" /></Link>
      </div>
      {activity.length ? (
        <ol className="relative mx-5 mb-4 mt-2 border-l border-line">
          {activity.map((a, i) => <ActivityItem key={i} a={a} />)}
        </ol>
      ) : <p className="px-5 pb-4 text-sm text-ink-3">Nothing has run yet.</p>}
    </Panel>
    </>
  );
}


type Tone = "violet" | "good" | "info" | "accent";
const TONE: Record<Tone, string> = {
  violet: "bg-violet-soft text-violet", good: "bg-good-soft text-good", info: "bg-info-soft text-info", accent: "bg-accent-soft text-info",
};

function Stat({ icon: Icon, tone, label, stat }: { icon: LucideIcon; tone: Tone; label: string; stat: WeekStat }) {
  const diff = stat.prev ? Math.round(((stat.now - stat.prev) / stat.prev) * 100) : null;
  return (
    <Panel className="flex min-w-0 flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full sm:size-12 ${TONE[tone]}`}><Icon className="size-5 sm:size-[22px]" strokeWidth={1.75} /></span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-2">{label}</p>
        <p className="num mt-0.5 text-[1.75rem] font-bold leading-none text-ink">{stat.now}</p>
        <p className="num mt-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
          {diff === null ? (stat.now ? <span className="font-medium text-good">New</span> : "–")
            : diff === 0 ? "Same"
            : <span className={`inline-flex items-center gap-0.5 font-medium ${diff > 0 ? "text-good" : "text-bad"}`}>
                {diff > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}{Math.abs(diff)}%
              </span>}
          <span>vs last week ({stat.prev})</span>
        </p>
      </div>
    </Panel>
  );
}

function RankCard({ title, href, empty, note, children }: { title: string; href: string; empty: string; note?: React.ReactNode; children: React.ReactNode[] }) {
  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="truncate font-bold text-ink">{title}</h2>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap py-1.5 text-sm font-medium text-info hover:underline">View all <ArrowRight className="size-3.5" /></Link>
      </div>
      {children.length ? <ol className="divide-y divide-line px-2 pb-2">{children}</ol> : <p className="px-5 pb-5 pt-2 text-sm text-ink-3">{empty}</p>}
      {children.length > 0 && note && <div className="mt-auto border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">{note}</div>}
    </Panel>
  );
}

// Initials avatars: no headshots are collected, and stock faces would be made up.
const AVATAR = ["bg-violet-soft text-violet", "bg-info-soft text-info", "bg-good-soft text-good", "bg-warn-soft text-warn", "bg-accent-soft text-accent-soft-ink"];
function Initials({ name, square = false }: { name: string; square?: boolean }) {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`grid size-10 shrink-0 place-items-center text-sm font-medium ${square ? "rounded-lg" : "rounded-full"} ${AVATAR[h % AVATAR.length]}`} aria-hidden>{ini}</span>;
}

// Two lines per entry: name (with role) and the one-line reason it ranks.
function Row({ href, rank, lead, title, sub, detail, label, pills }: {
  href: string; rank?: number; lead: React.ReactNode; title: string; sub?: string | null;
  detail: React.ReactNode; label: string; pills: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} title={label} className="flex min-h-[4.5rem] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2">
        {rank !== undefined && <span className="num w-3 shrink-0 text-sm font-medium text-ink-3">{rank}</span>}
        {lead}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm">
              <span className="font-medium text-ink">{title}</span>
              {sub && <span className="text-ink-3"> · {sub}</span>}
            </span>
            <span className="flex shrink-0 gap-1">{pills}</span>
          </span>
          <span className="num mt-1 block text-xs text-ink-3">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

// A channel's dot always carries its name (hover and screen readers), since ten hues alone are hard to tell apart.
function ShowDot({ show }: { show: string }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: showColor(show) }} title={show} role="img" aria-label={show} />;
}

function GuestRow({ g, i }: { g: RankedGuest; i: number }) {
  const high = g.shows >= 2 || g.views >= 500_000;
  const latest = g.episodes[0];
  return (
    <Row href={`/guests/${g.id}`} rank={i + 1} lead={<Initials name={g.name} />} title={g.name}
      label={[[g.role, g.company].filter(Boolean).join(", "), g.why].filter(Boolean).join(" · ")}
      detail={
        <span className="flex min-w-0 items-start gap-1.5">
          <span className="mt-[5px] flex shrink-0 gap-1">{[...new Set(g.episodes.map((e) => e.show))].map((sh) => <ShowDot key={sh} show={sh} />)}</span>
          <span className="line-clamp-2">
            {g.views > 0 && <span className="font-medium text-ink-2">{compact(g.views)} views · </span>}
            {latest ? latest.title : g.why}
          </span>
        </span>
      }
      pills={<span title="High: on 2+ of your channels, or 500K+ views in 30 days"><Pill tone={high ? "good" : "warn"}>{high ? "High" : "Medium"}</Pill></span>} />
  );
}

const TOPIC_TONE = ["bg-accent-soft text-accent-soft-ink", "bg-info-soft text-info", "bg-good-soft text-good", "bg-violet-soft text-violet", "bg-warn-soft text-warn"];
/** This week's episode count as a bar, last week's average as a tick, on one scale shared by the visible rows. */
function TopicRow({ t, i, scale }: { t: RankedTopic; i: number; scale: number }) {
  const delta = Math.round((t.thisWeek - t.priorAvg) * 10) / 10;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <Row href={`/topics/${t.slug}`} label={t.why}
      lead={<span className={`num grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${TOPIC_TONE[i % 5]}`}>{i + 1}</span>}
      title={t.label}
      detail={
        <span className="flex items-center gap-2">
          <span className="relative h-1.5 flex-1 rounded-full bg-bar-empty" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-info" style={{ width: pct(t.thisWeek) }} />
            {t.priorAvg > 0 && <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: pct(t.priorAvg) }} />}
          </span>
          <span className="sr-only">{t.why}</span>
        </span>
      }
      pills={t.trend === "new" ? <Pill tone="good">New</Pill>
        : <span className={`num inline-flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-ink-3"}`}>
            {delta > 0 ? <TrendingUp className="size-3.5" /> : null}{delta > 0 ? "+" : ""}{delta}
          </span>} />
  );
}

function SponsorRow({ b, i }: { b: RankedSponsor; i: number }) {
  const high = b.shows >= 2 || b.placements >= 2;
  const last = b.episodes[0];
  return (
    <Row href="/rankings?tab=sponsors" rank={i + 1} lead={<Initials name={b.name} square />} title={b.name} label={b.why}
      detail={
        <span className="flex min-w-0 items-start gap-1.5">
          <span className="mt-[5px] flex shrink-0 gap-1">{[...new Set(b.episodes.map((e) => e.show))].map((sh) => <ShowDot key={sh} show={sh} />)}</span>
          <span className="line-clamp-2">
            <span className="font-medium text-ink-2">{b.placements} {b.placements === 1 ? "placement" : "placements"} · </span>
            {last ? `last read ${fmtDate(last.publishedAt)} on ${last.show}` : b.why}
          </span>
        </span>
      }
      pills={<span title="High: paid placements on 2+ channels, or 2+ placements"><Pill tone={high ? "good" : "warn"}>{high ? "High" : "Medium"}</Pill></span>} />
  );
}

function RailItem({ icon: Icon, tone, href, title, sub }: { icon: LucideIcon; tone: Tone; href: string; title: string; sub: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-2">
        <span className={`grid size-11 shrink-0 place-items-center rounded-full ${TONE[tone]}`}><Icon className="size-5" strokeWidth={1.75} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          <span className="num mt-0.5 line-clamp-2 block text-xs leading-snug text-ink-3">{sub}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

const ACT: Record<Activity["kind"], { dot: string; label: string }> = {
  ingest: { dot: "bg-warn", label: "Episodes collected" },
  extract: { dot: "bg-good", label: "Episodes analysed" },
  research: { dot: "bg-violet", label: "Research updated" },
  brief: { dot: "bg-info", label: "Weekly brief" },
};
function ActivityItem({ a }: { a: Activity }) {
  const k = ACT[a.kind];
  return (
    <li className="relative pb-4 pl-5 last:pb-0">
      <span className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-surface ${k.dot}`} aria-hidden />
      <p className="text-sm font-medium text-ink">{k.label}</p>
      <p className="text-xs text-ink-3">{a.text} · {ago(a.at)}</p>
    </li>
  );
}
