"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ExternalLink, LoaderCircle, Search, TrendingDown, TrendingUp } from "lucide-react";
import { runTrendCheck, type TrendState } from "@/app/research-actions";
import type { TrendCheck } from "@/lib/trends";
import { btn, input } from "./ui";

const fmt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v);

const VERDICT: Record<TrendCheck["verdict"], { label: string; cls: string }> = {
  rising: { label: "Trending up on YouTube", cls: "bg-good-soft text-good" },
  steady: { label: "Steady on YouTube", cls: "bg-surface-2 text-ink-2" },
  cooling: { label: "Cooling off on YouTube", cls: "bg-bad-soft text-bad" },
  quiet: { label: "Very few new videos", cls: "bg-warn-soft text-warn" },
};

export function TrendSearch({ presets }: { presets: string[] }) {
  const [state, run, pending] = useActionState<TrendState, FormData>(runTrendCheck, { status: "idle" });

  return (
    <div className="rounded-xl border border-line bg-surface shadow-[var(--shadow)]">
      <form action={run} className="p-4 sm:p-5">
        <p className="font-medium text-ink">Is it trending?</p>
        <p className="mt-0.5 text-sm text-ink-3">Search any business topic, or pick one. Checks this week&apos;s YouTube uploads in India against last week, plus your own channels.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Topic to check</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input name="text" autoComplete="off" placeholder="e.g. venture debt, skincare D2C, quick commerce" className={`${input} w-full pl-9`} />
          </label>
          <button type="submit" disabled={pending} className={btn.primary}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}{pending ? "Checking…" : "Check trend"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p} type="submit" name="chip" value={p} disabled={pending}
              className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:border-info hover:text-ink disabled:opacity-60">
              {p}
            </button>
          ))}
        </div>
      </form>

      {state.status === "error" && <p role="alert" className="border-t border-line px-5 py-3 text-sm text-bad">{state.message}</p>}
      {state.status === "done" && <Result r={state.result} />}
    </div>
  );
}

function Result({ r }: { r: TrendCheck }) {
  const v = VERDICT[r.verdict];
  return (
    <div className="border-t border-line p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold text-ink">{r.query}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}>
          {r.verdict === "rising" ? <TrendingUp className="size-3" /> : r.verdict === "cooling" ? <TrendingDown className="size-3" /> : null}{v.label}
        </span>
        {r.google.status === "ok" && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium capitalize text-accent-soft-ink">News: {r.google.verdict}</span>
        )}
      </div>

      <dl className="num mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New videos, last 7 days" value={r.thisWeek.videos >= 25 ? "25+" : String(r.thisWeek.videos)} />
        <Stat label="Views per day, avg" value={fmt(r.thisWeek.perDay)} sub={`vs ${fmt(r.lastWeek.perDay)} the week before`} />
        <Stat label="Change" value={r.ratio === null ? "–" : `${r.ratio}×`} />
        <Stat label="On your channels, 30 days" value={String(r.yours.length)} />
      </dl>
      {r.angle && <p className="mt-4 text-sm leading-relaxed text-ink-2"><b className="font-medium text-ink">What people are watching:</b> {r.angle}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-ink-3">Top videos this week</p>
          <ul className="mt-2 space-y-2">
            {r.top.map((x) => (
              <li key={x.videoId}>
                <a href={`https://www.youtube.com/watch?v=${x.videoId}`} target="_blank" rel="noreferrer" className="group flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${x.videoId}/mqdefault.jpg`} alt="" loading="lazy" className="h-[45px] w-20 shrink-0 rounded-lg object-cover" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm text-ink group-hover:underline">{x.title}</span>
                    <span className="num text-xs text-ink-3">{x.channel} · {fmt(x.views)} views · {fmt(x.perDay)}/day</span>
                  </span>
                </a>
              </li>
            ))}
            {!r.top.length && <li className="text-sm text-ink-3">No videos on this in the last 7 days.</li>}
          </ul>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-ink-3">News and web</p>
            {r.google.status === "ok" ? (
              <>
                <p className="mt-2 text-sm text-ink-2">{r.google.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{r.google.signals.map((s) => <li key={s}>{s}</li>)}</ul>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {r.google.sources.map((s) => (
                    <li key={s.uri}><a href={s.uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-info hover:underline">{s.title || s.uri}<ExternalLink className="size-3" /></a></li>
                  ))}
                </ul>
              </>
            ) : <p className="mt-2 text-sm text-ink-3">{r.google.reason}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-ink-3">Your channels (titles or descriptions mention it)</p>
            <ul className="mt-2 space-y-1 text-sm">
              {r.yours.map((e) => (
                <li key={e.id}><Link href={`/episodes/${e.id}`} className="text-ink-2 hover:text-ink hover:underline">{e.show}: {e.title}</Link></li>
              ))}
              {!r.yours.length && <li className="text-ink-3">None in the last 30 days, so this could be an open angle.</li>}
            </ul>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-3">
        YouTube: the 25 most-viewed business videos (4+ minutes, India) published in each week. &ldquo;Trending up&rdquo; means views per day are at least 1.5× last week&apos;s; &ldquo;cooling&rdquo; means under 0.67×. Checked {new Date(r.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}, cached for 6 hours.
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-2/60 px-3 py-2.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}
