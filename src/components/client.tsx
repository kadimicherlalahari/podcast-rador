"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { btn } from "./ui";

/** A select that submits its form on change, so filters apply without an extra click. */
export function AutoSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/** Submit button that shows progress while its server action runs. */
export function SubmitButton({ children, pending: pendingLabel, variant = "primary", className = "" }: {
  children: React.ReactNode; pending?: string; variant?: keyof typeof btn; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${btn[variant]} ${className}`}>
      {pending && <LoaderCircle className="size-4 animate-spin" />}
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}

/** One-button form for a slow server action (Gemini research); shows progress and any error inline. */
export type ActionState = { status: "idle" | "done" | "error"; message?: string };

export function ActionButton({ action, fields, label, pending: pendingLabel, variant = "primary" }: {
  action: (prev: ActionState, f: FormData) => Promise<ActionState>; fields: Record<string, string>;
  label: React.ReactNode; pending: string; variant?: keyof typeof btn;
}) {
  const [state, run, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={run} className="flex flex-col items-start gap-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={pending} aria-busy={pending} className={btn[variant]}>
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {pending ? pendingLabel : label}
      </button>
      {state.status === "error" && state.message && <p role="alert" className="text-sm text-bad">{state.message}</p>}
      {state.status === "done" && state.message && <p role="status" className="text-sm text-good">{state.message}</p>}
    </form>
  );
}

/** Copies text to the clipboard and confirms for two seconds. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={btn.secondary}
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : label}
    </button>
  );
}
