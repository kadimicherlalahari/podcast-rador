"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ClipboardList, FileText, LayoutDashboard, ListVideo, RadioTower, Send } from "lucide-react";

const GROUPS = [
  {
    label: "This week",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/briefs", label: "Briefs", icon: FileText },
      { href: "/pipeline", label: "Outreach", icon: Send },
    ],
  },
  { label: "Data", items: [{ href: "/episodes", label: "Episodes", icon: ListVideo }] },
  {
    label: "Setup",
    items: [
      { href: "/admin/shows", label: "Shows", icon: RadioTower },
      { href: "/admin/runs", label: "Runs", icon: ClipboardList },
    ],
  },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function Items({ variant, active }: { variant: "side" | "top"; active: string | null }) {
  if (variant === "top") {
    return (
      <>
        {GROUPS.flatMap((g) => g.items).map(({ href, label, icon: Icon }) => {
          const on = active !== null && isActive(active, href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                on ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2"}`}>
              <Icon className="size-4" strokeWidth={1.75} />{label}
            </Link>
          );
        })}
      </>
    );
  }
  return (
    <>
      {GROUPS.map((g) => (
        <div key={g.label} className="mt-6 first:mt-0">
          <p className="px-3 pb-1.5 text-xs font-medium text-ink-3">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon }) => {
              const on = active !== null && isActive(active, href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      on ? "bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.08)]" : "text-ink-2 hover:bg-surface/70 hover:text-ink"}`}>
                    <Icon className={`size-4 ${on ? "text-accent" : ""}`} strokeWidth={1.75} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function Active({ variant }: { variant: "side" | "top" }) {
  return <Items variant={variant} active={usePathname()} />;
}

export function Nav({ variant }: { variant: "side" | "top" }) {
  return (
    <Suspense fallback={<Items variant={variant} active={null} />}>
      <Active variant={variant} />
    </Suspense>
  );
}
