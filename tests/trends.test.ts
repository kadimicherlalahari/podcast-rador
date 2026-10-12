import { describe, expect, it } from "vitest";
import { trendVerdict } from "../src/lib/trends";

const w = (videos: number, perDay: number) => ({ videos, views: 0, perDay });

describe("trendVerdict", () => {
  it("calls fewer than 3 new videos quiet, whatever the views", () => {
    expect(trendVerdict(w(2, 900_000), w(25, 10))).toEqual({ verdict: "quiet", ratio: null });
  });
  it("rising at 1.5x views per day or more", () => {
    expect(trendVerdict(w(25, 15_000), w(25, 10_000))).toEqual({ verdict: "rising", ratio: 1.5 });
  });
  it("cooling at 0.67x or less", () => {
    expect(trendVerdict(w(25, 6_000), w(25, 10_000))).toEqual({ verdict: "cooling", ratio: 0.6 });
  });
  it("steady in between", () => {
    expect(trendVerdict(w(10, 11_000), w(25, 10_000)).verdict).toBe("steady");
  });
  it("rising when nothing was published the week before", () => {
    expect(trendVerdict(w(5, 100), w(0, 0))).toEqual({ verdict: "rising", ratio: null });
  });
});
