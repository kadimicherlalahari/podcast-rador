import { distance } from "fastest-levenshtein";
import type { Kind } from "./classify";

type Strip = { showName?: string; hostNames?: string[] };

function base(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diacritics only; keep Devanagari etc. combining marks
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/#\S+/g, " ")
    .replace(/\b(?:ep|episode)\.?\s*#?\d+\b/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ") // drops emojis and punctuation
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(title: string, strip: Strip = {}): string {
  let t = ` ${base(title)} `;
  for (const phrase of [strip.showName, ...(strip.hostNames ?? [])]) {
    const p = phrase ? base(phrase) : "";
    if (p) t = t.split(` ${p} `).join("  ");
  }
  return t.replace(/\s+/g, " ").trim();
}

export function titleSimilarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - distance(a, b) / max;
}

export type MatchItem = { showId: string; title: string; publishedAt: string; kind: Kind };

export function isSameEpisode(
  a: MatchItem,
  b: MatchItem,
  threshold: number,
  windowDays: number,
  strip: Strip = {},
): boolean {
  if (a.showId !== b.showId || a.kind !== "full" || b.kind !== "full") return false;
  const days = Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) / 86_400_000;
  if (!(days <= windowDays)) return false;
  const na = normalizeTitle(a.title, strip);
  const nb = normalizeTitle(b.title, strip);
  if (!na || !nb) return false;
  if (titleSimilarity(na, nb) >= threshold) return true;
  // Extension to the spec: YouTube titles often add a long hook, so a long title fully contained in the other counts.
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.length >= 20 && long.includes(short)) return true;
  // Extension 2: the same episode is often retitled per platform ("Hook | Guest, Company"), but the
  // "| Guest" segment stays. Match if any non-trivial "|" / " - " segment is shared (same date window applies).
  const sa = segments(a.title, strip);
  const sb = segments(b.title, strip);
  return sa.some((x) => sb.some((y) => titleSimilarity(x, y) >= threshold || (Math.min(x.length, y.length) >= 12 && (x.includes(y) || y.includes(x)))));
}

function segments(title: string, strip: Strip): string[] {
  const parts = title.split(/\||\s[-\u2013\u2014]\s/).map((p) => normalizeTitle(p, strip));
  return parts.length > 1 ? parts.filter((p) => p.length >= 12) : [];
}
