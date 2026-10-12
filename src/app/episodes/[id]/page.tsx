import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, ExternalLink, Headphones, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import {
  KIND_LABEL, PageSkeleton, Panel, ShowName, StatusPill, btn, duration, fmtDate, fmtDateTime,
} from "@/components/ui";

export default function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <Link href="/episodes" className={`${btn.ghost} -ml-2.5`}><ArrowLeft className="size-4" /> Episodes</Link>
      <div className="mt-4">
        <Suspense fallback={<PageSkeleton />}>
          <Episode params={params} />
        </Suspense>
      </div>
    </>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  youtube: "Watch on YouTube", rss: "Open in podcast feed", spotify: "Open in Spotify", audio: "Audio file",
};

async function Episode({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db().execute({
    sql: "select e.*, s.name show_name from episodes e join shows s on s.id = e.show_id where e.id = ?",
    args: [id],
  });
  const e = rows[0];
  if (!e) notFound();
  const urls = JSON.parse(String(e.source_urls ?? "{}")) as Record<string, string>;
  const kind = String(e.kind);
  const status = String(e.status);

  const extractionNote =
    status === "skipped"
      ? `This is a ${KIND_LABEL[kind]?.toLowerCase() ?? kind}, so it's skipped. Only full episodes are analysed, which keeps clips from inflating guest counts.`
      : status === "failed"
        ? `Extraction failed: ${String(e.extraction_error ?? "unknown error")}`
        : status === "extracted"
          ? "Guests, topics and sponsor mentions were extracted from this episode."
          : "Next, Gemini will read the title and description below and pull out guests, topics and sponsor mentions. Every item has to quote this text, or it's dropped.";

  const ids: [string, unknown][] = [
    ["YouTube video", e.youtube_video_id], ["RSS guid", e.rss_guid], ["Spotify episode", e.spotify_episode_id],
    ["Audio file", e.audio_url], ["Added", fmtDateTime(String(e.created_at))],
  ];

  return (
    <article>
      <ShowName name={String(e.show_name)} className="text-sm font-medium text-ink-2" />
      <h1 className="mt-2 max-w-3xl text-balance text-[1.65rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
        {String(e.title)}
      </h1>
      <p className="num mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
        <span>{fmtDate(e.published_at as string, { day: "numeric", month: "long", year: "numeric" })}</span>
        <span className="text-line-strong">•</span>
        <span>{duration(e.duration_seconds as number | null)}</span>
        <span className="text-line-strong">•</span>
        <span>{KIND_LABEL[kind] ?? kind}</span>
        <StatusPill status={status} />
      </p>

      {(Object.keys(urls).length > 0 || Boolean(e.audio_url)) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(urls).map(([k, u]) => (
            <a key={k} href={u} target="_blank" rel="noreferrer" className={btn.secondary}>
              {SOURCE_LABEL[k] ?? k} <ExternalLink className="size-3.5 text-ink-3" />
            </a>
          ))}
          {Boolean(e.audio_url) && !urls.audio && (
            <a href={String(e.audio_url)} target="_blank" rel="noreferrer" className={btn.secondary}>
              <Headphones className="size-4 text-ink-3" /> Audio file
            </a>
          )}
        </div>
      )}

      <Panel className="mt-8 flex gap-3 px-5 py-4">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.75} />
        <div>
          <p className="font-medium text-ink">AI extraction</p>
          <p className="mt-0.5 max-w-[68ch] text-sm leading-relaxed text-ink-2">{extractionNote}</p>
        </div>
      </Panel>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-ink">Description</h2>
        <p className="mt-0.5 text-sm text-ink-3">Text from every source, merged. Extraction reads only this.</p>
        <div className="mt-4 max-w-[70ch] whitespace-pre-line break-words text-[0.95rem] leading-[1.7] text-ink-2">
          {String(e.description ?? "").trim() || <span className="text-ink-3">No description was provided by the source.</span>}
        </div>
      </section>

      <details className="group mt-10 rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-medium text-ink-2 hover:text-ink">
          <ChevronRight className="chev size-4 transition-transform" /> Source identifiers
        </summary>
        <dl className="grid gap-x-6 gap-y-2 border-t border-line px-5 py-4 text-sm sm:grid-cols-[10rem_1fr]">
          {ids.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k}</dt>
              <dd className="break-all font-mono text-[0.8rem] text-ink-2">{v ? String(v) : "–"}</dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
  );
}
