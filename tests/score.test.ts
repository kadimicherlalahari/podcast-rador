import { describe, expect, it } from "vitest";
import { comparePair, pairKey, sponsorScore, topicTrend, weekStartIst } from "../src/lib/entities";

describe("comparePair", () => {
  it("near-identical names merge", () => expect(comparePair("nikhil kamath", "nikhil kamat", "guest").verdict).toBe("same"));
  it("legal suffixes are ignored for brands", () => expect(comparePair("rezolve", "rezolve plc", "brand").verdict).toBe("same"));
  it("borderline similarity goes to Gemini", () => expect(comparePair("mantisgrid", "mantisgrid ai", "brand").verdict).toBe("ask"));
  it("extra trailing words go to Gemini", () => expect(comparePair("skyroot", "skyroot aerospace", "brand").verdict).toBe("ask"));
  it("short prefixes don't", () => expect(comparePair("ge", "ge healthcare", "brand").verdict).toBe("different"));
  it("different people stay apart", () => expect(comparePair("nikhil gupta", "nikhil kamath", "guest").verdict).toBe("different"));
  it("pair keys are order-independent", () => expect(pairKey("b", "a")).toEqual(pairKey("a", "b")));
});

describe("weekStartIst", () => {
  it("Monday early morning IST belongs to that week", () => expect(weekStartIst(new Date("2026-10-11T22:00:00Z"))).toBe("2026-10-12"));
  it("Sunday evening IST belongs to the previous Monday", () => expect(weekStartIst(new Date("2026-10-11T12:00:00Z"))).toBe("2026-10-05"));
});

describe("sponsorScore", () => {
  const w = { shows: 3, placements: 1, recency: 2, halflifeDays: 14 };
  it("adds spread, volume and full recency today", () => expect(sponsorScore({ shows: 2, placements: 3, daysSinceLast: 0 }, w)).toBe(11));
  it("recency halves after one half-life", () => expect(sponsorScore({ shows: 1, placements: 1, daysSinceLast: 14 }, w)).toBe(5));
});

describe("topicTrend", () => {
  it("new when nothing before", () => expect(topicTrend(2, 0)).toEqual({ priorAvg: 0, ratio: null, trend: "new" }));
  it("rising", () => expect(topicTrend(3, 4).trend).toBe("rising"));
  it("falling", () => expect(topicTrend(0, 8).trend).toBe("falling"));
  it("steady", () => expect(topicTrend(1, 4)).toEqual({ priorAvg: 1, ratio: 1, trend: "steady" }));
});
