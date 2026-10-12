import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { ChevronRight, ClipboardList, DownloadCloud, FileText, ListOrdered, Lock, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { ingestAll } from "@/lib/ingest";
import { extractBatch, requeueFailed } from "@/lib/extract";
import { resolveEntities } from "@/lib/resolve";
import { runInsights } from "@/lib/insights";
import Link from "next/link";
import { ActionButton, SubmitButton } from "@/components/client";
import { writeAndSendBrief } from "@/app/research-actions";
import { EmptyState, btn, PageHeader, PageSkeleton, Panel, Pill, ShowName, ago, fmtDateTime, n } from "@/components/ui";

export const maxDuration = 300;
export const metadata = { title: "Runs" };

async function runIngest() {
  "use server";
  await ingestAll({ youtubeMaxPages: 1 });
  revalidatePath("/admin/runs");
  revalidatePath("/");
}

async function runExtract() {
  "use server";
  await extractBatch({ deadlineMs: 240_000 });
  revalidatePath("/admin/runs");
  revalidatePath("/");
}

async function runScore() {
  "use server";
  await resolveEntities({ deadlineMs: 240_000 });
  revalidatePath("/admin/runs");
  revalidatePath("/rankings");
  revalidatePath("/");
}

async function runResearch() {
  "use server";
  await runInsights({ deadlineMs: 240_000 });
  revalidatePath("/admin/runs");
  revalidatePath("/rankings");
  revalidatePath("/");
}

async function retryFailed() {
  "use server";
  await requeueFailed();
  await runExtract();
}

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Runs"
        description="Run each stage yourself here. A daily job at 3:30 am IST that collects, extracts a batch and writes the brief on Mondays is switched on in Phase 5."
      />

      <Panel className="mt-8">
        <ul className="divide-y divide-line">
          <Stage icon={DownloadCloud} title="Collect new episodes"
            body="Checks YouTube and RSS for every active show, filters out clips, and merges duplicates across sources. Takes a minute or two.">
            <form action={runIngest}>
              <SubmitButton pending="Collecting… keep this tab open">Run now</SubmitButton>
            </form>
          </Stage>
          <Stage icon={Sparkles} title="Extract with AI"
            body="Gemini pulls guests, topics and sponsor mentions out of up to 15 waiting episodes. Anything it can't quote from the episode text is dropped.">
            <div className="flex flex-wrap gap-2">
              <form action={runExtract}>
                <SubmitButton pending="Extracting… keep this tab open">Run now</SubmitButton>
              </form>
              <Suspense>
                <RetryFailed />
              </Suspense>
            </div>
          </Stage>
          <Stage icon={ListOrdered} title="Score and rank"
            body="Merges duplicate guest and brand names (Gemini checks the borderline ones), then ranks media rounds, topic momentum and sponsors with plain SQL.">
            <div className="flex flex-wrap gap-2">
              <form action={runScore}>
                <SubmitButton pending="Scoring… keep this tab open">Run now</SubmitButton>
              </form>
              <Link href="/rankings" className={btn.secondary}>View rankings</Link>
            </div>
          </Stage>
          <Stage icon={Sparkles} title="Stats and research"
            body="Fetches YouTube views, likes and top comments, then has Gemini research the top 10 guests, watch the top episodes, and write briefs for the top 6 topics. Fresh results are reused, so reruns are cheap.">
            <form action={runResearch}>
              <SubmitButton pending="Researching… keep this tab open">Run now</SubmitButton>
            </form>
          </Stage>
          <Stage icon={FileText} title="Write and email the brief"
            body="Gemini writes the week's summary and a draft email for each top guest and brand, from the rankings and research. Emailed to you only; nothing goes to guests or brands.">
            <div className="flex flex-wrap gap-2">
              <ActionButton action={writeAndSendBrief} fields={{}} label="Run now" pending="Writing and sending… about a minute" />
              <Link href="/pipeline" className={btn.secondary}>View drafts</Link>
            </div>
          </Stage>
        </ul>
      </Panel>

      <h2 className="mt-10 text-base font-bold text-ink">Extraction history</h2>
      <p className="mt-0.5 text-sm text-ink-3">Dropped items are ones Gemini returned but couldn&apos;t back with a quote from the episode text, or that named a host as a guest.</p>
      <div className="mt-3">
        <Suspense fallback={<PageSkeleton />}>
          <ExtractHistory />
        </Suspense>
      </div>

      <h2 className="mt-10 text-base font-bold text-ink">Collection history</h2>
      <p className="mt-0.5 text-sm text-ink-3">The newest run is expanded. Merged means the same episode was found on both YouTube and RSS.</p>
      <div className="mt-3">
        <Suspense fallback={<PageSkeleton />}>
          <History />
        </Suspense>
      </div>
    </>
  );
}

function Stage({ icon: Icon, title, body, locked, children }: {
  icon: typeof Sparkles; title: string; body: string; locked?: string; children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <Icon className={`size-5 shrink-0 ${locked ? "text-ink-3" : "text-info"}`} strokeWidth={1.75} />
      <div className="flex-1">
        <p className={`font-medium ${locked ? "text-ink-2" : "text-ink"}`}>{title}</p>
        <p className="mt-0.5 text-sm text-ink-3">{body}</p>
      </div>
      {locked ? <Pill><Lock className="size-3" /> Arrives in {locked}</Pill> : children}
    </li>
  );
}

async function RetryFailed() {
  await connection();
  const failed = Number((await db().execute("select count(*) c from episodes where status = 'failed'")).rows[0].c);
  if (!failed) return null;
  return (
    <form action={retryFailed}>
      <SubmitButton variant="secondary" pending="Retrying…">Retry {failed} failed</SubmitButton>
    </form>
  );
}

const STOP_LABEL: Record<string, string> = {
  done: "Queue empty", batch_limit: "Batch done", call_cap: "Hit Gemini call cap", deadline: "Hit time limit", rate_limited: "Rate-limited by Gemini",
};

async function ExtractHistory() {
  await connection();
  const { rows } = await db().execute("select * from extract_runs order by started_at desc limit 20");
  if (!rows.length) {
    return <EmptyState icon={Sparkles} title="No extraction runs yet">Use Run now on Extract with AI to process waiting episodes.</EmptyState>;
  }
  return (
    <Panel className="overflow-x-auto">
      <table className="num w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-5 py-2 font-medium">Started</th>
            <th className="py-2 text-right font-medium">Extracted</th>
            <th className="py-2 text-right font-medium">Guests</th>
            <th className="py-2 text-right font-medium">Paid brands</th>
            <th className="py-2 text-right font-medium">Dropped</th>
            <th className="py-2 text-right font-medium">Gemini calls</th>
            <th className="px-5 py-2 text-right font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const kept = JSON.parse(String(r.kept)) as Record<string, number>;
            const dropped = Object.values(JSON.parse(String(r.dropped)) as Record<string, number>).reduce((a, b) => a + b, 0);
            const errors = JSON.parse(String(r.errors)) as string[];
            const failed = Number(r.failed);
            return (
              <tr key={String(r.id)} className="align-top text-ink-2">
                <td className="px-5 py-2.5">
                  <span className="block text-ink">{fmtDateTime(String(r.started_at))}</span>
                  <span className="block text-xs text-ink-3">{ago(String(r.started_at))}</span>
                  {errors.length > 0 && <span className="mt-1 block max-w-md break-words text-xs text-bad">{errors[0]}{errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}</span>}
                </td>
                <td className="py-2.5 text-right font-medium text-ink">{n(r.extracted)}{failed ? <span className="text-bad"> · {failed} failed</span> : null}</td>
                <td className="py-2.5 text-right">{n(kept.guests)}</td>
                <td className="py-2.5 text-right">{n(kept.paid_brands)}</td>
                <td className="py-2.5 text-right">{n(dropped)}</td>
                <td className="py-2.5 text-right">{n(r.gemini_calls)}</td>
                <td className="px-5 py-2.5 text-right">
                  <Pill tone={r.stop_reason === "rate_limited" || failed ? "warn" : "good"} dot>{STOP_LABEL[String(r.stop_reason)] ?? String(r.stop_reason)}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

type Stats = { yt_new: number; rss_new: number; merged: number; inserted: number; errors?: string[] };

async function History() {
  await connection();
  const { rows } = await db().execute("select * from ingest_runs order by started_at desc limit 50");
  if (!rows.length) {
    return <EmptyState icon={ClipboardList} title="No runs yet">Use Run now above to collect episodes for the first time.</EmptyState>;
  }
  return (
    <Panel className="overflow-hidden">
      {rows.map((r, idx) => {
        const per = JSON.parse(String(r.per_show)) as Record<string, Stats>;
        const errors = JSON.parse(String(r.errors)) as string[];
        const vals = Object.values(per);
        const inserted = vals.reduce((a, s) => a + s.inserted, 0);
        const merged = vals.reduce((a, s) => a + s.merged, 0);
        const secs = r.finished_at ? Math.round((+new Date(String(r.finished_at)) - +new Date(String(r.started_at))) / 1000) : null;
        return (
          <details key={String(r.id)} open={idx === 0} className="group border-b border-line last:border-b-0">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-2/50">
              <ChevronRight className="chev size-4 text-ink-3 transition-transform" />
              <span className="min-w-40">
                <span className="block text-sm font-medium text-ink">{fmtDateTime(String(r.started_at))}</span>
                <span className="block text-xs text-ink-3">{ago(String(r.started_at))}{secs !== null ? ` · took ${secs}s` : ""}</span>
              </span>
              <span className="num flex-1 text-sm text-ink-2">
                <b className="font-bold text-ink">{n(inserted)}</b> new · {n(merged)} merged
              </span>
              {!r.finished_at ? <Pill tone="warn" dot>Didn&apos;t finish</Pill>
                : errors.length ? <Pill tone="bad" dot>{errors.length} {errors.length === 1 ? "error" : "errors"}</Pill>
                : <Pill tone="good" dot>OK</Pill>}
            </summary>
            <div className="px-5 pb-5 pl-12">
              <div className="overflow-x-auto">
                <table className="num w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th className="py-2 font-medium">Show</th>
                      <th className="py-2 text-right font-medium">New from YouTube</th>
                      <th className="py-2 text-right font-medium">New from RSS</th>
                      <th className="py-2 text-right font-medium">Merged</th>
                      <th className="py-2 text-right font-medium">Saved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {Object.entries(per).map(([name, s]) => (
                      <tr key={name} className={s.inserted ? "text-ink" : "text-ink-3"}>
                        <td className="py-2"><ShowName name={name} /></td>
                        <td className="py-2 text-right">{s.yt_new}</td>
                        <td className="py-2 text-right">{s.rss_new}</td>
                        <td className="py-2 text-right">{s.merged}</td>
                        <td className="py-2 text-right font-medium">{s.inserted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {errors.length > 0 && (
                <ul className="mt-4 space-y-1 rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">
                  {errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}
                </ul>
              )}
            </div>
          </details>
        );
      })}
    </Panel>
  );
}
