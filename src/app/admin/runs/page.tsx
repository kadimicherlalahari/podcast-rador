import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { ChevronRight, ClipboardList, DownloadCloud, FileText, Lock, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { ingestAll } from "@/lib/ingest";
import { SubmitButton } from "@/components/client";
import { EmptyState, PageHeader, PageSkeleton, Panel, Pill, ShowName, ago, fmtDateTime, n } from "@/components/ui";

export const maxDuration = 300;
export const metadata = { title: "Runs" };

async function runIngest() {
  "use server";
  await ingestAll({ youtubeMaxPages: 1 });
  revalidatePath("/admin/runs");
  revalidatePath("/");
}

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Runs"
        description="A scheduled job runs every day at 3:30 am IST: it collects new episodes, extracts a batch, and writes the brief on Mondays. You can also run each stage yourself."
      />

      <Panel className="mt-8">
        <ul className="divide-y divide-line">
          <Stage icon={DownloadCloud} title="Collect new episodes"
            body="Checks YouTube and RSS for every active show, filters out clips, and merges duplicates across sources. Takes a minute or two.">
            <form action={runIngest}>
              <SubmitButton pending="Collecting… keep this tab open">Run now</SubmitButton>
            </form>
          </Stage>
          <Stage icon={Sparkles} title="Extract with AI" body="Pulls guests, topics and sponsor mentions out of waiting episodes." locked="Phase 3" />
          <Stage icon={FileText} title="Write the brief" body="Scores the week and writes Monday's brief." locked="Phase 5" />
        </ul>
      </Panel>

      <h2 className="mt-10 text-base font-semibold text-ink">History</h2>
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
      <Icon className={`size-5 shrink-0 ${locked ? "text-ink-3" : "text-accent"}`} strokeWidth={1.75} />
      <div className="flex-1">
        <p className={`font-medium ${locked ? "text-ink-2" : "text-ink"}`}>{title}</p>
        <p className="mt-0.5 text-sm text-ink-3">{body}</p>
      </div>
      {locked ? <Pill><Lock className="size-3" /> Arrives in {locked}</Pill> : children}
    </li>
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
                <b className="font-semibold text-ink">{n(inserted)}</b> new · {n(merged)} merged
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
