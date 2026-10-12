import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Pause, Play, Plus, RadioTower, Search, X } from "lucide-react";
import { db } from "@/lib/db";
import { searchChannels, type YtCandidate } from "@/lib/youtube";
import { searchFeeds, type PiFeed } from "@/lib/podcastindex";
import { searchShows, spotifyEnabled, type SpotifyCandidate } from "@/lib/spotify";
import { SubmitButton } from "@/components/client";
import { EmptyState, PageHeader, PageSkeleton, Panel, Pill, ShowName, btn, fmtDate, input } from "@/components/ui";
import {
  addShow, updateShow, toggleActive, confirmYoutube, confirmYoutubeByInput, confirmRss, confirmSpotify,
} from "./actions";

export const metadata = { title: "Shows" };

type Show = {
  id: string; name: string; youtube_channel_id: string | null; youtube_uploads_playlist_id: string | null;
  rss_url: string | null; spotify_show_id: string | null; podcastindex_feed_id: number | null;
  host_names: string[]; language: string | null; active: boolean;
};

async function safe<T>(fn: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try { return { data: await fn() }; } catch (e) { return { error: (e as Error).message }; }
}

type SP = Promise<{ resolve?: string; go?: string }>;

export default function ShowsPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader
        title="Shows"
        description="The podcasts the radar watches. Each show needs a YouTube channel or an RSS feed before episodes can be collected. Host names are left out of guest lists."
      />
      <form action={addShow} className="mt-6 flex max-w-lg gap-2">
        <label className="flex-1">
          <span className="sr-only">New show name</span>
          <input name="name" placeholder="Add a show by name, e.g. The Neon Show" required className={`${input} w-full`} />
        </label>
        <SubmitButton pending="Adding…"><Plus className="size-4" /> Add show</SubmitButton>
      </form>
      <div className="mt-8">
        <Suspense fallback={<PageSkeleton />}>
          <Shows searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Shows({ searchParams }: { searchParams: SP }) {
  const { resolve, go } = await searchParams;
  const { data, error } = await safe(() => db().execute("select * from shows order by active desc, created_at, name"));
  const shows: Show[] = (data?.rows ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    youtube_channel_id: r.youtube_channel_id as string | null,
    youtube_uploads_playlist_id: r.youtube_uploads_playlist_id as string | null,
    rss_url: r.rss_url as string | null,
    spotify_show_id: r.spotify_show_id as string | null,
    podcastindex_feed_id: r.podcastindex_feed_id as number | null,
    host_names: JSON.parse(String(r.host_names ?? "[]")),
    language: r.language as string | null,
    active: r.active === 1,
  }));
  const spotify = spotifyEnabled();

  if (error) return <p className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">Couldn&apos;t load shows: {error}</p>;
  if (!shows.length) return <EmptyState icon={RadioTower} title="No shows yet">Add the first podcast to monitor above.</EmptyState>;

  const activeCount = shows.filter((s) => s.active).length;

  return (
    <>
      <p className="mb-3 text-sm text-ink-3">{activeCount} of {shows.length} shows are being monitored.</p>
      <Panel>
        <ul className="divide-y divide-line">
          {shows.map((s) => {
            const open = resolve === s.id;
            const hasSource = Boolean(s.youtube_uploads_playlist_id || s.rss_url);
            return (
              <li key={s.id} className={s.active ? "" : "bg-surface-2/40"}>
                <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink"><ShowName name={s.name} /></span>
                      {s.active ? <Pill tone="good" dot>Monitoring</Pill> : <Pill>Paused</Pill>}
                    </div>
                    <p className="ml-4 mt-0.5 text-sm text-ink-3">
                      {s.host_names.length ? `Hosted by ${s.host_names.join(", ")}` : "No host names yet"}
                      {s.language ? ` · ${s.language}` : ""}
                    </p>
                  </div>
                  <div className="ml-4 flex flex-wrap items-center gap-1.5 lg:ml-0">
                    <SourceChip label="YouTube" ok={Boolean(s.youtube_uploads_playlist_id)} />
                    <SourceChip label="RSS" ok={Boolean(s.rss_url)} />
                    {spotify && <SourceChip label="Spotify" ok={Boolean(s.spotify_show_id)} />}
                  </div>
                  <div className="ml-4 flex gap-1 lg:ml-2">
                    <Link className={btn.ghost} href={open ? "/admin/shows" : `/admin/shows?resolve=${s.id}`} scroll={false}>
                      {open ? <><X className="size-4" /> Close</> : <><Search className="size-4" /> Find sources</>}
                    </Link>
                    <form action={toggleActive}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={s.active ? "1" : "0"} />
                      <SubmitButton variant="ghost" pending={s.active ? "Pausing…" : "Resuming…"}>
                        {s.active ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Resume</>}
                      </SubmitButton>
                    </form>
                  </div>
                </div>

                {s.active && !hasSource && (
                  <p className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                    <AlertTriangle className="size-4 shrink-0" /> No source connected, so nothing can be collected. Use Find sources.
                  </p>
                )}

                {open && (
                  <div className="border-t border-line bg-surface-2/50 px-5 py-5">
                    <ResolvePanel show={s} fetchNow={go === "1"} />
                  </div>
                )}

                <details className="group border-t border-line/70">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-5 py-2 text-xs font-medium text-ink-3 hover:text-ink">
                    <ChevronRight className="chev size-3.5 transition-transform" /> Edit details and IDs
                  </summary>
                  <div className="grid gap-6 px-5 pb-5 pt-2 lg:grid-cols-2">
                    <form action={updateShow} className="space-y-3">
                      <input type="hidden" name="id" value={s.id} />
                      <Field label="Show name"><input name="name" defaultValue={s.name} className={`${input} w-full`} /></Field>
                      <Field label="Hosts" hint="Comma-separated. Excluded from guest lists.">
                        <input name="host_names" defaultValue={s.host_names.join(", ")} placeholder="e.g. Nikhil Kamath" className={`${input} w-full`} />
                      </Field>
                      <Field label="Language"><input name="language" defaultValue={s.language ?? ""} placeholder="e.g. en" className={`${input} w-28`} /></Field>
                      <SubmitButton variant="secondary">Save changes</SubmitButton>
                    </form>
                    <dl className="grid content-start gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
                      {([
                        ["YouTube channel", s.youtube_channel_id],
                        ["Uploads playlist", s.youtube_uploads_playlist_id],
                        ["RSS feed", s.rss_url],
                        ["Podcast Index feed", s.podcastindex_feed_id],
                        ...(spotify ? [["Spotify show", s.spotify_show_id]] : []),
                      ] as [string, unknown][]).map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-ink-3">{k}</dt>
                          <dd className="break-all font-mono text-[0.8rem] text-ink-2">{v ? String(v) : "–"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}

function SourceChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
      ok ? "border-line bg-surface text-ink-2" : "border-dashed border-line-strong text-ink-3"}`}>
      <span className={`size-1.5 rounded-full ${ok ? "bg-good" : "bg-line-strong"}`} />
      {label}<span className="sr-only">{ok ? " connected" : " not connected"}</span>
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="ml-2 text-xs text-ink-3">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function PasteChannel({ id }: { id: string }) {
  return (
    <form action={confirmYoutubeByInput} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="id" value={id} />
      <label className="flex-1">
        <span className="sr-only">YouTube channel URL or handle</span>
        <input name="input" required placeholder="Paste a YouTube channel URL or @handle" className={`${input} w-full`} />
      </label>
      <SubmitButton variant="secondary" pending="Resolving…">Use this channel</SubmitButton>
    </form>
  );
}

function Candidate({ title, meta, children }: { title: React.ReactNode; meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 break-words text-xs text-ink-3">{meta}</p>
      </div>
      {children}
    </div>
  );
}

async function ResolvePanel({ show, fetchNow }: { show: Show; fetchNow: boolean }) {
  if (!fetchNow) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-ink">Search YouTube, Podcast Index{spotifyEnabled() ? " and Spotify" : ""} for &ldquo;{show.name}&rdquo;</p>
          <p className="mt-0.5 text-sm text-ink-3">You confirm each match. Nothing is saved automatically. A YouTube search uses 100 of the 10,000 daily quota units.</p>
          <Link className={`${btn.primary} mt-3`} href={`/admin/shows?resolve=${show.id}&go=1`} scroll={false}>
            <Search className="size-4" /> Search for matches
          </Link>
        </div>
        <div>
          <p className="mb-2 text-sm text-ink-2">Already know the YouTube channel? Paste it to skip the search.</p>
          <PasteChannel id={show.id} />
        </div>
      </div>
    );
  }
  const [yt, pi, sp] = await Promise.all([
    safe(() => searchChannels(show.name)),
    safe(() => searchFeeds(show.name)),
    spotifyEnabled() ? safe(() => searchShows(show.name)) : safe(async () => [] as SpotifyCandidate[]),
  ]);
  const err = (e?: string) => e && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{e}</p>;
  const none = (d?: unknown[]) => d && !d.length && <p className="text-sm text-ink-3">No matches found.</p>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">YouTube channels</h3>
        {err(yt.error)}{none(yt.data)}
        {yt.data?.map((c: YtCandidate) => (
          <Candidate key={c.channelId} title={<>{c.title} <span className="font-normal text-ink-3">{c.handle}</span></>}
            meta={<>{c.subscriberCount !== undefined ? `${c.subscriberCount.toLocaleString("en-IN")} subscribers` : "Subscriber count hidden"} · <span className="font-mono">{c.channelId}</span></>}>
            <form action={confirmYoutube}>
              <input type="hidden" name="id" value={show.id} />
              <input type="hidden" name="channelId" value={c.channelId} />
              <SubmitButton variant="secondary" pending="Saving…">Use this channel</SubmitButton>
            </form>
          </Candidate>
        ))}
        <div className="pt-1"><PasteChannel id={show.id} /></div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Podcast RSS feeds</h3>
        {err(pi.error)}{none(pi.data)}
        {pi.data?.map((f: PiFeed) => (
          <Candidate key={f.id} title={<>{f.title} <span className="font-normal text-ink-3">by {f.author}</span></>}
            meta={<>{f.episodeCount} episodes · {f.language} · updated {f.lastUpdateTime ? fmtDate(new Date(f.lastUpdateTime * 1000).toISOString()) : "unknown"} · <a className="text-accent hover:underline" href={f.url} target="_blank" rel="noreferrer">{f.url}</a></>}>
            <form action={confirmRss}>
              <input type="hidden" name="id" value={show.id} />
              <input type="hidden" name="feedId" value={f.id} />
              <SubmitButton variant="secondary" pending="Saving…">Use this feed</SubmitButton>
            </form>
          </Candidate>
        ))}
      </section>

      {spotifyEnabled() && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Spotify shows</h3>
          {err(sp.error)}{none(sp.data)}
          {sp.data?.map((c: SpotifyCandidate) => (
            <Candidate key={c.id} title={<>{c.name} <span className="font-normal text-ink-3">by {c.publisher}</span></>}
              meta={<>{c.totalEpisodes} episodes · <span className="font-mono">{c.id}</span></>}>
              <form action={confirmSpotify}>
                <input type="hidden" name="id" value={show.id} />
                <input type="hidden" name="spotifyId" value={c.id} />
                <SubmitButton variant="secondary" pending="Saving…">Use this show</SubmitButton>
              </form>
            </Candidate>
          ))}
        </section>
      )}
    </div>
  );
}
