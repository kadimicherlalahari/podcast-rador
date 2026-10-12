import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

const TZ = "Asia/Kolkata";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
};

export const input =
  "rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-accent focus:outline-none";

export function PageHeader({ title, description, actions }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-[1.65rem] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, action, children, className = "" }: {
  title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`mt-10 ${className}`}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)] ${className}`}>
      {children}
    </div>
  );
}

type Tone = "neutral" | "accent" | "good" | "warn" | "bad";
const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent-soft-ink",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Pill({ tone = "neutral", children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Stable, distinguishable colour per show so a show reads the same on every page.
const SHOW_HUES = [222, 12, 152, 280, 38, 190, 330, 95, 250, 0];
export function showColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${SHOW_HUES[h % SHOW_HUES.length]} 62% 52%)`;
}

export function ShowName({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: showColor(name) }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: {
  icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-8">
      <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent-soft-ink">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="max-w-xl">
        <p className="font-semibold text-ink">{title}</p>
        {children && <div className="mt-1 text-sm leading-relaxed text-ink-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-medium text-accent hover:underline">
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-24" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  );
}

// ---- formatting ----

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-IN", { timeZone: TZ, ...opts, ...(sameYear || opts.year ? {} : { year: "numeric" }) });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  const m = s / 60, h = m / 60, d = h / 24;
  if (m < 60) return `${Math.floor(m)} min ago`;
  if (h < 24) return `${Math.floor(h)} h ago`;
  if (d < 2) return "yesterday";
  if (d < 30) return `${Math.floor(d)} days ago`;
  return fmtDate(iso);
}

export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "–";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-IN");

export const KIND_LABEL: Record<string, string> = {
  full: "Full episode", clip: "Clip", trailer: "Trailer", live_upcoming: "Live / upcoming",
};

export function StatusPill({ status }: { status: string }) {
  switch (status) {
    case "pending_extraction": return <Pill tone="accent" dot>Awaiting extraction</Pill>;
    case "extracted": return <Pill tone="good" dot>Extracted</Pill>;
    case "failed": return <Pill tone="bad" dot>Extraction failed</Pill>;
    case "skipped": return <Pill>Skipped</Pill>;
    default: return <Pill>{status}</Pill>;
  }
}

/** Next Monday ~03:30 IST, when the daily job (22:00 UTC Sunday) builds the brief. */
export function nextBriefLabel(): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const day = ist.getDay(); // 0 Sun .. 1 Mon
  let add = (8 - day) % 7;
  if (add === 0 && (ist.getHours() > 3 || (ist.getHours() === 3 && ist.getMinutes() >= 30))) add = 7;
  const target = new Date(ist);
  target.setDate(ist.getDate() + add);
  const label = target.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return add === 0 ? "Today, 3:30 am IST" : `${label}, 3:30 am IST`;
}

/** Monday (IST) of the current week, as a display label. */
export function weekLabel(): string {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const back = (ist.getDay() + 6) % 7;
  ist.setDate(ist.getDate() - back);
  return ist.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}
