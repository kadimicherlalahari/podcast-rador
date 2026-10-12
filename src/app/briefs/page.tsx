import Link from "next/link";
import { FileText, Megaphone, Send, TrendingUp, UserRoundSearch } from "lucide-react";
import { EmptyState, PageHeader, Panel, Section, TextLink } from "@/components/ui";

export const metadata = { title: "Briefs" };

const PARTS = [
  { icon: UserRoundSearch, title: "Who to book", body: "Guests on two or more of your shows in the last 30 days (media rounds), and early guests seen on only one." },
  { icon: TrendingUp, title: "What to cover", body: "Topics gaining or losing ground this week compared with the previous 4 weeks, with episode counts." },
  { icon: Megaphone, title: "Who to pitch", body: "Brands running paid ad reads or sponsor disclosures, ranked by how many shows and how recently." },
  { icon: Send, title: "Outreach drafts", body: "Short pitches for the top 5 guests and brands, ready to edit on the Outreach page." },
];

const STEPS = [
  ["Brief", "Every Monday a brief is saved here and emailed. Gemini writes only the summary text."],
];

export default function BriefsPage() {
  return (
    <>
      <PageHeader title="Briefs" description="One brief every Monday morning, with every claim linked to the episodes behind it." />

      <div className="mt-8">
        <EmptyState icon={FileText} title="No briefs yet" action={<TextLink href="/episodes">See collected episodes</TextLink>}>
          Extraction and scoring are running; see the live <Link href="/rankings" className="underline">Rankings</Link>. Briefs arrive with the next phase.
        </EmptyState>
      </div>

      <Section title="What each brief contains">
        <Panel>
          <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {PARTS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className={`flex gap-3 px-5 py-4 ${i > 1 ? "sm:border-t sm:border-line" : ""} ${i % 2 ? "sm:border-l sm:border-line" : ""}`}>
                <Icon className="mt-0.5 size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
                <div>
                  <p className="font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>

      <Section title="Still to build" description="These stages come next, in order.">
        <ol className="relative space-y-5 border-l border-line-strong pl-6">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="relative">
              <span className="num absolute -left-[2.15rem] top-0 grid size-5 place-items-center rounded-full border border-line-strong bg-bg text-[0.7rem] font-medium text-ink-2">{i + 1}</span>
              <p className="font-medium text-ink">{title}</p>
              <p className="mt-0.5 max-w-[65ch] text-sm leading-relaxed text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
