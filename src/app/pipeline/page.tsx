import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Send } from "lucide-react";
import { db } from "@/lib/db";
import { CopyButton } from "@/components/client";
import { EmptyState, PageHeader, PageSkeleton, Panel, Pill, Section, ago } from "@/components/ui";

export const metadata = { title: "Outreach" };

export default function OutreachPage() {
  return (
    <>
      <PageHeader
        title="Outreach"
        description="Draft emails for the week's top guests and sponsors, written with each brief. Copy, edit and send them yourself. Nothing goes out automatically."
      />
      <Suspense fallback={<PageSkeleton />}><Drafts /></Suspense>
    </>
  );
}

async function Drafts() {
  await connection();
  const { rows } = await db().execute(`
    select p.entity_type, p.entity_id, p.status, p.draft, p.updated_at,
      coalesce(g.canonical_name, b.canonical_name) name, g.company, g.role
    from pipeline p
      left join guests g on p.entity_type = 'guest' and g.id = p.entity_id
      left join brands b on p.entity_type = 'brand' and b.id = p.entity_id
    where p.draft is not null order by p.entity_type desc, p.updated_at desc`);
  if (!rows.length) {
    return (
      <div className="mt-8">
        <EmptyState icon={Send} title="No drafts yet">
          Drafts are written with each weekly brief. Run <b>Write and email the brief</b> on the <Link href="/admin/runs" className="underline">Runs</Link> page.
        </EmptyState>
      </div>
    );
  }
  const groups = [
    { title: "Guests to book", rows: rows.filter((r) => r.entity_type === "guest") },
    { title: "Brands to pitch", rows: rows.filter((r) => r.entity_type === "brand") },
  ];
  return groups.filter((g) => g.rows.length).map((g) => (
    <Section key={g.title} title={g.title}>
      <div className="space-y-3">
        {g.rows.map((r) => {
          const draft = String(r.draft);
          const [subjectLine, ...rest] = draft.split("\n");
          return (
            <Panel key={`${r.entity_type}:${r.entity_id}`} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {r.entity_type === "guest"
                    ? <Link href={`/guests/${r.entity_id}`} className="font-medium text-ink hover:underline">{String(r.name)}</Link>
                    : <p className="font-medium text-ink">{String(r.name)}</p>}
                  {(r.role || r.company) && <p className="text-sm text-ink-3">{[r.role, r.company].filter(Boolean).join(", ")}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={r.status === "suggested" ? "accent" : r.status === "booked" ? "good" : r.status === "declined" ? "bad" : "neutral"}>
                    {String(r.status).replace(/^./, (c) => c.toUpperCase())}
                  </Pill>
                  <CopyButton text={draft} />
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-ink">{subjectLine.replace(/^Subject:\s*/, "")}</p>
              <div className="mt-2 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink-2">{rest.join("\n").trim()}</div>
              <p className="mt-3 text-xs text-ink-3">Written {ago(String(r.updated_at))}</p>
            </Panel>
          );
        })}
      </div>
    </Section>
  ));
}
