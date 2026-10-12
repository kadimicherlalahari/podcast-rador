import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, ChevronRight, ExternalLink, Headphones, MessageSquareQuote, PlayCircle, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { readInsight, type EpisodeAnalysis } from "@/lib/insights";
import {
  KIND_LABEL, PageSkeleton, Panel, Pill, ShowName, StatusPill, btn, duration, fmtDate, fmtDateTime,
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
  // Dates are formatted relative to now, so render at request time rather than prerendering.
  await connection();
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
          ? `Extracted ${e.extracted_at ? fmtDateTime(String(e.extracted_at)) : ""}. Each item below quotes the episode text it came from.`
          : "Next, Gemini will read the title and description below and pull out guests, topics and sponsor mentions. Every item has to quote this text, or it's dropped.";

  const [guests, brands, topics] = status === "extracted" ? await Promise.all([
    db().execute({ sql: "select g.canonical_name name, g.company, g.role, a.evidence from appearances a join guests g on g.id = a.guest_id where a.episode_id = ? order by g.canonical_name", args: [id] }),
    db().execute({ sql: "select b.canonical_name name, m.mention_type, m.evidence from brand_mentions m join brands b on b.id = m.brand_id where m.episode_id = ? order by m.mention_type = 'organic', b.canonical_name", args: [id] }),
    db().execute({ sql: "select t.label from episode_topics et join topics t on t.id = et.topic_id where et.episode_id = ? order by t.label", args: [id] }),
  ]).then((r) => r.map((x) => x.rows)) : [[], [], []];
  const dropped = (JSON.parse(String(e.extraction_stats ?? "{}")).dropped ?? []) as { type: string; name: string; evidence?: string; reason: string }[];

  const ids: [string, unknown][] = [
    ["YouTube video", e.youtube_video_id], ["RSS guid", e.rss_guid], ["Spotify episode", e.spotify_episode_id],
    ["Audio file", e.audio_url], ["Added", fmtDateTime(String(e.created_at))],
  ];

  return (
    <article>
      <ShowName name={String(e.show_name)} className="text-sm font-medium text-ink-2" />
      <h1 className="mt-2 max-w-3xl text-balance text-2xl font-bold leading-tight tracking-[-0.02em] text-ink">
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

      {e.business_related === 0 && (
        <p className="mt-8 flex items-start gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink-2">
          <Ban className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <span><b className="font-medium text-ink">Not about startups or business</b>, so it isn&apos;t watched or counted in rankings.
            {e.business_reason ? ` ${String(e.business_reason)}` : ""}</span>
        </p>
      )}

      {e.youtube_video_id ? <VideoSummary id={id} videoId={String(e.youtube_video_id)} /> : null}

      <Panel className="mt-8 flex gap-3 px-5 py-4">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-info" strokeWidth={1.75} />
        <div>
          <p className="font-medium text-ink">AI extraction</p>
          <p className="mt-0.5 max-w-[68ch] text-sm leading-relaxed text-ink-2">{extractionNote}</p>
        </div>
      </Panel>

      {status === "extracted" && (
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <Found title="Guests" empty="No guests found in the text.">
            {guests.map((g) => (
              <Item key={String(g.name)} evidence={String(g.evidence)}>
                <span className="font-medium text-ink">{String(g.name)}</span>
                {(g.role || g.company) && <span className="text-ink-3"> · {[g.role, g.company].filter(Boolean).join(", ")}</span>}
              </Item>
            ))}
          </Found>
          <Found title="Brands" empty="No brands mentioned.">
            {brands.map((b) => (
              <Item key={`${b.name}-${b.mention_type}`} evidence={String(b.evidence)}>
                <span className="font-medium text-ink">{String(b.name)}</span>{" "}
                {b.mention_type === "organic" ? <Pill>Mentioned</Pill> : <Pill tone="accent">{b.mention_type === "paid_read" ? "Ad read" : "Sponsor"}</Pill>}
              </Item>
            ))}
          </Found>
          <Found title="Topics" empty="No topics tagged.">
            {topics.length > 0 && <li className="flex flex-wrap gap-1.5 px-4 py-3">{topics.map((t) => <Pill key={String(t.label)}>{String(t.label)}</Pill>)}</li>}
          </Found>
          <Found title="Dropped by the evidence check" empty="Nothing dropped. Every item quoted the text.">
            {dropped.filter((d) => d.type !== "topic").map((d, i) => (
              <Item key={i} evidence={d.evidence}>
                <span className="font-medium text-ink-2 line-through decoration-ink-3">{d.name || "(blank)"}</span>{" "}
                <span className="text-xs text-ink-3">{d.type} · {d.reason === "host" ? "is a host" : d.reason === "evidence" ? "quote not in text" : "empty"}</span>
              </Item>
            ))}
          </Found>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-base font-bold text-ink">Description</h2>
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
              <dd className="break-all font-mono text-xs text-ink-2">{v ? String(v) : "–"}</dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
  );
}

function Found({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <Panel>
      <h3 className="border-b border-line px-4 py-2.5 text-sm font-bold text-ink">{title}</h3>
      <ul className="divide-y divide-line">
        {items.length ? items : <li className="px-4 py-3 text-sm text-ink-3">{empty}</li>}
      </ul>
    </Panel>
  );
}

function Item({ evidence, children }: { evidence?: string; children: React.ReactNode }) {
  return (
    <li className="px-4 py-3 text-sm">
      <p>{children}</p>
      {evidence && <p className="mt-1 break-words text-xs italic text-ink-3">&ldquo;{evidence}&rdquo;</p>}
    </li>
  );
}

const ytTime = (t: string) => t.split(":").reduce((s, p) => s * 60 + Number(p || 0), 0);

async function VideoSummary({ id, videoId }: { id: string; videoId: string }) {
  const a = await readInsight<EpisodeAnalysis>("episode", id, "analysis");
  if (!a) return null;
  if (a.error) return <p className="mt-8 text-sm text-ink-3">Gemini couldn&apos;t watch this video: {a.error}</p>;
  const v = a.payload;
  const at = (t: string) => `https://www.youtube.com/watch?v=${videoId}&t=${ytTime(t)}s`;
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink"><PlayCircle className="size-4 text-info" /> Video summary</h2>
      <p className="mt-0.5 text-sm text-ink-3">Gemini watched the first {v.minutes} minutes. Times link to that moment on YouTube.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Panel className="p-5">
          <p className="text-sm leading-relaxed text-ink">{v.summary}</p>
          {v.guest_points.length > 0 && <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">{v.guest_points.map((x) => <li key={x}>{x}</li>)}</ul>}
          {v.quotes.map((q, i) => (
            <blockquote key={i} className="mt-4 border-l-2 border-line-strong pl-3 text-sm text-ink-2">
              <MessageSquareQuote className="mb-1 size-4 text-ink-3" />&ldquo;{q.quote}&rdquo;
              <a href={at(q.time)} target="_blank" rel="noreferrer" className="num ml-1 text-xs text-info hover:underline">{q.speaker} · {q.time}</a>
            </blockquote>
          ))}
        </Panel>
        <Panel className="p-5">
          <p className="text-xs font-medium text-ink-3">Highlights</p>
          <ol className="mt-2 space-y-2 text-sm">
            {v.highlights.map((x, i) => (
              <li key={i} className="flex gap-3">
                <a href={at(x.time)} target="_blank" rel="noreferrer" className="num w-12 shrink-0 text-info hover:underline">{x.time}</a>
                <span className="text-ink-2">{x.point}</span>
              </li>
            ))}
          </ol>
          {v.questions_discussed.length > 0 && (
            <>
              <p className="mt-5 text-xs font-medium text-ink-3">Questions discussed</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">{v.questions_discussed.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
        </Panel>
      </div>
    </section>
  );
}
