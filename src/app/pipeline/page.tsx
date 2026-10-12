import { ArrowRight, Send } from "lucide-react";
import { EmptyState, PageHeader, Pill, Section } from "@/components/ui";

export const metadata = { title: "Outreach" };

export default function OutreachPage() {
  return (
    <>
      <PageHeader
        title="Outreach"
        description="Pitch drafts for the week's top guests and sponsors. You edit, copy and send them yourself. Nothing goes out automatically."
      />

      <div className="mt-8">
        <EmptyState icon={Send} title="No drafts yet">
          Drafts are written after each Monday brief for the top 5 guests and top 5 brands, using the evidence behind them: which shows they appeared on and which topics are still uncovered.
        </EmptyState>
      </div>

      <Section title="How each draft moves" description="Change the status as a conversation progresses.">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent">Suggested</Pill>
          <ArrowRight className="size-4 text-ink-3" />
          <Pill>Pitched</Pill>
          <ArrowRight className="size-4 text-ink-3" />
          <Pill>Replied</Pill>
          <ArrowRight className="size-4 text-ink-3" />
          <Pill tone="good">Booked</Pill>
          <span className="text-sm text-ink-3">or</span>
          <Pill tone="bad">Declined</Pill>
        </div>
      </Section>
    </>
  );
}
