import { describe, expect, it } from "vitest";
import { classifyKind } from "../src/lib/classify";
import { isSameEpisode, normalizeTitle, titleSimilarity } from "../src/lib/match";
import { parseClockDuration, parseIsoDuration } from "../src/lib/duration";

describe("classifyKind", () => {
  const t = "Some talk";
  it("clip by duration", () => expect(classifyKind({ title: t, durationSeconds: 600 }, 15)).toBe("clip"));
  it("full at/above threshold", () => expect(classifyKind({ title: t, durationSeconds: 900 }, 15)).toBe("full"));
  it("clip by #shorts", () => expect(classifyKind({ title: t, description: "x #Shorts", durationSeconds: 3600 }, 15)).toBe("clip"));
  it("trailer", () => expect(classifyKind({ title: "Season 2 Teaser", durationSeconds: 3600 }, 15)).toBe("trailer"));
  it("live", () => expect(classifyKind({ title: t, durationSeconds: 10, liveBroadcastContent: "upcoming" }, 15)).toBe("live_upcoming"));
  it("unknown duration is not a clip", () => expect(classifyKind({ title: t, durationSeconds: null }, 15)).toBe("full"));
});

describe("match", () => {
  const strip = { showName: "The Neon Show", hostNames: ["Siddhartha Ahluwalia"] };
  const mk = (title: string, publishedAt: string, showId = "s1", kind: "full" | "clip" = "full") => ({ showId, title, publishedAt, kind });
  it("normalizes", () => {
    expect(normalizeTitle("Ep 123: Café Founder 🚀 (Hindi) #startup | The Neon Show", strip)).toBe("cafe founder");
  });
  it("similarity", () => {
    expect(titleSimilarity("abc", "abc")).toBe(1);
    expect(titleSimilarity("abcd", "abxx")).toBe(0.5);
  });
  it("same episode", () =>
    expect(isSameEpisode(mk("How I built X!", "2026-10-01T10:00:00Z"), mk("How I built X", "2026-10-02T10:00:00Z"), 0.85, 3)).toBe(true));
  it("window", () =>
    expect(isSameEpisode(mk("How I built X", "2026-10-01T10:00:00Z"), mk("How I built X", "2026-10-09T10:00:00Z"), 0.85, 3)).toBe(false));
  it("different shows", () =>
    expect(isSameEpisode(mk("How I built X", "2026-10-01T10:00:00Z"), mk("How I built X", "2026-10-01T10:00:00Z", "s2"), 0.85, 3)).toBe(false));
  it("clips never match", () =>
    expect(isSameEpisode(mk("How I built X", "2026-10-01T10:00:00Z", "s1", "clip"), mk("How I built X", "2026-10-01T10:00:00Z"), 0.85, 3)).toBe(false));
  it("shared guest segment", () =>
    expect(isSameEpisode(mk("Why Even a $100B Company Is Too Small | Tanay Tandon", "2026-09-03T10:00:00Z"),
      mk("How Tanay Tandon is Building a Healthcare AI Company | Tanay Tandon", "2026-09-03T11:00:00Z"), 0.85, 3)).toBe(true));
  it("no shared segment", () =>
    expect(isSameEpisode(mk("Topic one is great | Alice Smith", "2026-09-03T10:00:00Z"),
      mk("Another topic entirely | Bob Jones", "2026-09-03T11:00:00Z"), 0.85, 3)).toBe(false));
  it("containment extension", () =>
    expect(isSameEpisode(mk("Building a unicorn from scratch in India with zero funding | brutal truths", "2026-10-01T10:00:00Z"),
      mk("Building a unicorn from scratch in India", "2026-10-01T12:00:00Z"), 0.85, 3)).toBe(true));
});

describe("duration parsers", () => {
  it("iso", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("junk")).toBeNull();
  });
  it("clock", () => {
    expect(parseClockDuration("01:02:03")).toBe(3723);
    expect(parseClockDuration("12:30")).toBe(750);
    expect(parseClockDuration("1800")).toBe(1800);
    expect(parseClockDuration("")).toBeNull();
    expect(parseClockDuration("abc")).toBeNull();
  });
});
