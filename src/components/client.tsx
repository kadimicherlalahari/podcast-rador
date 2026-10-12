"use client";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
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
