"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ClipboardList, Hash, House, ListVideo, Megaphone, RadioTower, Send, UsersRound, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; match: (path: string, tab: string | null) => boolean };

const rankTab = (t: string) => (path: string, tab: string | null) => path === "/rankings" && (tab ?? "guests") === t;

const GROUPS: Item[][] = [
  [
    { href: "/", label: "Home", icon: House, match: (p) => p === "/" },
    { href: "/rankings?tab=guests", label: "Guests", icon: UsersRound, match: (p, t) => rankTab("guests")(p, t) || p.startsWith("/guests/") },
    { href: "/rankings?tab=topics", label: "Topics", icon: Hash, match: (p, t) => rankTab("topics")(p, t) || p.startsWith("/topics/") },
    { href: "/rankings?tab=sponsors", label: "Sponsors", icon: Megaphone, match: rankTab("sponsors") },
    { href: "/pipeline", label: "Outreach", icon: Send, match: (p) => p === "/pipeline" },
  ],
  [
    { href: "/episodes", label: "Episodes", icon: ListVideo, match: (p) => p.startsWith("/episodes") },
    { href: "/admin/shows", label: "Channels", icon: RadioTower, match: (p) => p.startsWith("/admin/shows") },
    { href: "/admin/runs", label: "Runs", icon: ClipboardList, match: (p) => p.startsWith("/admin/runs") },
  ],
];

function Items({ variant, path, tab }: { variant: "side" | "top"; path: string | null; tab: string | null }) {
  const on = (i: Item) => path !== null && i.match(path, tab);
  if (variant === "top") {
    // YouTube's mobile chip row.
    return (
      <>
        {GROUPS.flat().map((i) => (
          <Link key={i.href} href={i.href} aria-current={on(i) ? "page" : undefined}
            className={`inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              on(i) ? "bg-ink text-bg" : "bg-surface-2 text-ink hover:bg-line-strong"}`}>
            {i.label}
          </Link>
        ))}
      </>
    );
  }
  return (
    <>
      {GROUPS.map((g, gi) => (
        <ul key={gi} className={gi ? "mt-2 space-y-0.5 border-t border-line pt-2 2xl:mt-3 2xl:pt-3" : "space-y-0.5"}>
          {g.map((i) => {
            const active = on(i);
            const Icon = i.icon;
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-3.5 text-[0.65rem] transition-colors 2xl:h-10 2xl:flex-row 2xl:gap-4 2xl:px-3 2xl:py-0 2xl:text-sm ${
                    active ? "bg-accent-soft font-medium text-accent-soft-ink" : "text-ink hover:bg-surface-2"}`}>
                  {/* YouTube's mini guide below 1536px: icon over a small label; full rows above. */}
                  <Icon className={`size-5 shrink-0 ${active ? "text-accent" : "text-ink-2"}`} strokeWidth={active ? 2 : 1.6} />
                  <span className="max-w-full truncate">{i.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </>
  );
}

function Active({ variant }: { variant: "side" | "top" }) {
  return <Items variant={variant} path={usePathname()} tab={useSearchParams().get("tab")} />;
}

export function Nav({ variant }: { variant: "side" | "top" }) {
  return (
    <Suspense fallback={<Items variant={variant} path={null} tab={null} />}>
      <Active variant={variant} />
    </Suspense>
  );
}
