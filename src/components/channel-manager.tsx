"use client";
import { useActionState } from "react";
import { LoaderCircle, Plus, RotateCcw, Search, X } from "lucide-react";
import { addChannel, findChannel, removeChannel, restoreChannel, type FindState } from "@/app/channel-actions";
import { SubmitButton } from "./client";
import { btn, input } from "./ui";

export type ChannelRow = {
  id: string; name: string; active: boolean; channelId: string | null;
  episodes30d: number; latest: string | null;
};

const compactSubs = (v?: number) =>
  v === undefined ? "Subscriber count hidden"
    : `${v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : v} subscribers`;

export function ChannelManager({ channels }: { channels: ChannelRow[] }) {
  const [state, find, finding] = useActionState<FindState, FormData>(findChannel, { status: "idle" });
  const active = channels.filter((c) => c.active);
  const removed = channels.filter((c) => !c.active);

  return (
    <div className="rounded-xl border border-line bg-surface shadow-[var(--shadow)]">
      <div className="border-b border-line p-4 sm:p-5">
        <form action={find} className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">YouTube channel link, @handle or channel ID</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input name="q" required autoComplete="off" spellCheck={false}
              placeholder="Paste a channel link, @handle or channel ID (UC…)"
              className={`${input} w-full pl-9`} />
          </label>
          <button type="submit" disabled={finding} className={btn.secondary}>
            {finding && <LoaderCircle className="size-4 animate-spin" />}
            {finding ? "Looking up…" : "Find channel"}
          </button>
        </form>

        {state.status === "error" && <p role="alert" className="mt-3 text-sm text-bad">{state.message}</p>}
        {state.status === "found" && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
            {state.channel.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.channel.thumbnail} alt="" className="size-11 rounded-full" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{state.channel.title}</p>
              <p className="truncate text-sm text-ink-3">
                {[state.channel.handle, compactSubs(state.channel.subscriberCount)].filter(Boolean).join(" · ")}
              </p>
            </div>
            {state.tracked === "active" ? (
              <span className="text-sm text-ink-3">Already tracked</span>
            ) : (
              <form action={addChannel}>
                <input type="hidden" name="channelId" value={state.channel.channelId} />
                <SubmitButton pending="Adding and collecting…">
                  <Plus className="size-4" />{state.tracked === "removed" ? "Track again" : "Add channel"}
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>

      <ul className="divide-y divide-line">
        {active.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <div className="min-w-0 flex-1">
              {c.channelId ? (
                <a href={`https://www.youtube.com/channel/${c.channelId}`} target="_blank" rel="noreferrer"
                  className="block truncate text-sm font-medium text-ink hover:underline">{c.name}</a>
              ) : <p className="truncate text-sm font-medium text-ink">{c.name}</p>}
              <p className="num text-xs text-ink-3">
                {c.episodes30d ? `${c.episodes30d} full ${c.episodes30d === 1 ? "episode" : "episodes"} in 30 days` : "No full episodes in 30 days"}
              </p>
            </div>
            <form action={removeChannel}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton variant="ghost" pending="Removing…" className="text-ink-3">
                <X className="size-4" />Remove
              </SubmitButton>
            </form>
          </li>
        ))}
        {!active.length && <li className="px-5 py-6 text-sm text-ink-3">No channels tracked. Add one above.</li>}
      </ul>

      {removed.length > 0 && (
        <details className="border-t border-line px-4 py-3 sm:px-5">
          <summary className="cursor-pointer text-sm text-ink-3">{removed.length} removed {removed.length === 1 ? "channel" : "channels"} (history kept)</summary>
          <ul className="mt-2 divide-y divide-line">
            {removed.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{c.name}</span>
                <form action={restoreChannel}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton variant="ghost" pending="Restoring…"><RotateCcw className="size-4" />Track again</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
