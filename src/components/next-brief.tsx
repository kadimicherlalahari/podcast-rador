"use client";
import { useSyncExternalStore } from "react";
import { CalendarClock } from "lucide-react";
import { nextBriefLabel } from "./ui";

const noop = () => () => {};

export function NextBrief() {
  // Computed on the client only: the label depends on the current time in IST.
  const label = useSyncExternalStore(noop, nextBriefLabel, () => null);
  return (
    <div className="mx-1 rounded-lg border border-line bg-surface px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        <CalendarClock className="size-3.5" strokeWidth={1.75} /> Next scheduled brief
      </p>
      <p className="num mt-0.5 min-h-5 text-sm font-medium text-ink">{label ?? ""}</p>
    </div>
  );
}
