import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Hash, ListVideo, Megaphone, RadioTower, Search, UsersRound, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, PageSkeleton, Panel, Section, fmtDate, input } from "@/components/ui";

export const metadata = { title: "Search" };

type SP = Promise<{ q?: string }>;

export default function SearchPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader title="Search" description="Guests, topics, brands, episodes and channels from your data." />
      <Suspense fallback={<PageSkeleton />}><Results searchParams={searchParams} /></Suspense>
    </>
  );
}

type Hit = { href: string; title: string; sub: string };

async function Results({ searchParams }: { searchParams: SP }) {
  await connection();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const form = (
    <form action="/search" role="search" className="mt-6 max-w-xl">
      <label className="relative block">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input name="q" type="search" defaultValue={q} autoFocus={!q} placeholder="Search guests, topics, brands, episodes…" className={`${input} w-full pl-10`} />
      </label>
    </form>
  );
  if (q.length < 2) return form;

  const like = `%${q.toLowerCase()}%`;
  const [guests, topics, brands, episodes, shows] = await Promise.all([
    db().execute({ sql: "select id, canonical_name, company, role from guests where lower(canonical_name) like ? or lower(coalesce(company, '')) like ? order by canonical_name limit 12", args: [like, like] }),
    db().execute({ sql: "select slug, label from topics where lower(label) like ? or slug like ? order by label limit 12", args: [like, like] }),
    db().execute({
      sql: `select b.canonical_name, count(m.id) mentions from brands b left join brand_mentions m on m.brand_id = b.id
            where lower(b.canonical_name) like ? group by b.id order by mentions desc limit 12`,
      args: [like],
    }),
    db().execute({
      sql: `select e.id, e.title, e.published_at, s.name show from episodes e join shows s on s.id = e.show_id
            where e.kind = 'full' and lower(e.title) like ? order by e.published_at desc limit 20`,
      args: [like],
    }),
    db().execute({ sql: "select id, name, active from shows where lower(name) like ? order by name limit 10", args: [like] }),
  ]);

  const groups: { title: string; icon: LucideIcon; hits: Hit[] }[] = [
    { title: "Guests", icon: UsersRound, hits: guests.rows.map((r) => ({ href: `/guests/${r.id}`, title: String(r.canonical_name), sub: [r.role, r.company].filter(Boolean).join(", ") })) },
    { title: "Topics", icon: Hash, hits: topics.rows.map((r) => ({ href: `/topics/${r.slug}`, title: String(r.label), sub: "" })) },
    { title: "Brands", icon: Megaphone, hits: brands.rows.map((r) => ({ href: "/rankings?tab=sponsors", title: String(r.canonical_name), sub: `${r.mentions} ${Number(r.mentions) === 1 ? "mention" : "mentions"}` })) },
    { title: "Episodes", icon: ListVideo, hits: episodes.rows.map((r) => ({ href: `/episodes/${r.id}`, title: String(r.title), sub: `${r.show} · ${fmtDate(r.published_at as string)}` })) },
    { title: "Channels", icon: RadioTower, hits: shows.rows.map((r) => ({ href: `/episodes?show=${r.id}`, title: String(r.name), sub: r.active === 1 ? "Tracked" : "Removed (history kept)" })) },
  ].filter((g) => g.hits.length);

  return (
    <>
      {form}
      {!groups.length && (
        <div className="mt-8">
          <EmptyState icon={Search} title={`Nothing matches "${q}"`}>
            Try a guest&apos;s surname, a company, or a topic like &ldquo;fundraising&rdquo;. To see whether something is trending beyond your channels, use the trend check on the <Link href="/rankings?tab=topics" className="underline">Topics</Link> tab.
          </EmptyState>
        </div>
      )}
      {groups.map(({ title, icon: Icon, hits }) => (
        <Section key={title} title={`${title} (${hits.length})`}>
          <Panel>
            <ul className="divide-y divide-line px-2 py-1">
              {hits.map((h) => (
                <li key={h.href + h.title}>
                  <Link href={h.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2">
                    <Icon className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.75} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{h.title}</span>
                      {h.sub && <span className="block truncate text-xs text-ink-3">{h.sub}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      ))}
    </>
  );
}
