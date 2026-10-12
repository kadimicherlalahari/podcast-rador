// Pure helpers for Stage 4 (entity resolution) and Stage 5 (scoring).
import { titleSimilarity } from "./match";

export type EntityType = "guest" | "brand";
export type PairVerdict = "same" | "ask" | "different";

// Legal suffixes say nothing about which company it is ("Saregama India Ltd." = "Saregama").
const LEGAL = /\b(?:pvt|private|ltd|limited|inc|llc|llp|plc|corp|corporation)\b/g;

function compareKey(key: string, type: EntityType): string {
  if (type === "guest") return key;
  return key.replace(LEGAL, " ").replace(/\s+/g, " ").trim() || key;
}

/**
 * Spec thresholds on normalized keys: ratio ≥ 0.9 → same, 0.75–0.9 → ask Gemini, below → different.
 * Extension: when one name is the other plus extra words ("Skyroot" / "Skyroot Aerospace") Levenshtein is low,
 * so those go to Gemini too.
 */
export function comparePair(aKey: string, bKey: string, type: EntityType): { verdict: PairVerdict; similarity: number } {
  const a = compareKey(aKey, type);
  const b = compareKey(bKey, type);
  if (a === b) return { verdict: "same", similarity: 1 };
  const similarity = Math.round(titleSimilarity(a, b) * 1000) / 1000;
  if (similarity >= 0.9) return { verdict: "same", similarity };
  if (similarity >= 0.75) return { verdict: "ask", similarity };
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(`${short} `)) return { verdict: "ask", similarity };
  return { verdict: "different", similarity };
}

/** Decisions are stored once per unordered pair. */
export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Monday (IST) of the week containing `asOf`, as YYYY-MM-DD. */
export function weekStartIst(asOf: Date): string {
  const ist = new Date(asOf.getTime() + 5.5 * 3_600_000);
  ist.setUTCDate(ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7));
  return ist.toISOString().slice(0, 10);
}

/** Spread and volume, plus a recency bonus that halves every `halflifeDays` since the latest placement. */
export function sponsorScore(
  s: { shows: number; placements: number; daysSinceLast: number },
  w: { shows: number; placements: number; recency: number; halflifeDays: number },
): number {
  const decay = 0.5 ** (Math.max(0, s.daysSinceLast) / w.halflifeDays);
  return Math.round((s.shows * w.shows + s.placements * w.placements + w.recency * decay) * 100) / 100;
}

export type Trend = "new" | "rising" | "falling" | "steady";

/** This week's episode count vs. the average week over the prior four. Counts are small, so trend uses the absolute change. */
export function topicTrend(thisWeek: number, priorFourWeeks: number): { priorAvg: number; ratio: number | null; trend: Trend } {
  const priorAvg = priorFourWeeks / 4;
  const ratio = priorAvg ? Math.round((thisWeek / priorAvg) * 100) / 100 : null;
  const delta = thisWeek - priorAvg;
  const trend: Trend = priorAvg === 0 && thisWeek > 0 ? "new" : delta >= 1 ? "rising" : delta <= -1 ? "falling" : "steady";
  return { priorAvg, ratio, trend };
}
