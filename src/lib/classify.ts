export type Kind = "full" | "clip" | "trailer" | "live_upcoming";

export function classifyKind(
  e: { title: string; description?: string | null; durationSeconds?: number | null; liveBroadcastContent?: string | null },
  clipMaxMinutes: number,
): Kind {
  if (e.liveBroadcastContent === "live" || e.liveBroadcastContent === "upcoming") return "live_upcoming";
  const known = e.durationSeconds !== null && e.durationSeconds !== undefined;
  if (known && e.durationSeconds! < clipMaxMinutes * 60) return "clip";
  if (/#shorts\b/i.test(`${e.title} ${e.description ?? ""}`)) return "clip";
  if (/\b(trailer|teaser)\b/i.test(e.title)) return "trailer";
  return "full";
}
