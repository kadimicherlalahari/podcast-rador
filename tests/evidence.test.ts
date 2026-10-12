import { describe, expect, it } from "vitest";
import { evidenceFound, normalizeName, verifyExtraction } from "../src/lib/evidence";

describe("normalizeName", () => {
  it("strips honorifics, brackets, case and spacing", () => {
    expect(normalizeName("  Dr.  Devi   Shetty (Narayana Health) ")).toBe("devi shetty");
    expect(normalizeName("Shri Nitin Gadkari")).toBe("nitin gadkari");
    expect(normalizeName("Mr Kunal Shah")).toBe("kunal shah");
  });
  it("keeps names that start like an honorific", () => expect(normalizeName("Drishti Shah")).toBe("drishti shah"));
  it("folds diacritics", () => expect(normalizeName("Zoë Café")).toBe("zoe cafe"));
});

describe("evidenceFound", () => {
  const src = "Title: Building Zepto\n\nThis episode is   Brought to you by  CRED. Use code NEON10.";
  it("case and whitespace insensitive", () => expect(evidenceFound("brought to you by cred", src)).toBe(true));
  it("curly quotes fold", () => expect(evidenceFound("Zepto’s", "Zepto's story")).toBe(true));
  it("rejects paraphrase", () => expect(evidenceFound("sponsored by CRED", src)).toBe(false));
  it("rejects trivially short evidence", () => expect(evidenceFound("by", src)).toBe(false));
});

describe("verifyExtraction", () => {
  const src = "Title: Aadit Palicha on Zepto | Founder Thesis\n\nAkshay Datt speaks with Aadit Palicha, co-founder of Zepto. Sponsored by Razorpay.";
  const out = verifyExtraction({
    guests: [
      { name: "Aadit Palicha", company: "Zepto", role: "Co-founder", evidence: "Aadit Palicha, co-founder of Zepto" },
      { name: "Akshay Datt", evidence: "Akshay Datt speaks" },
      { name: "Kaivalya Vohra", evidence: "Kaivalya Vohra joins" },
    ],
    topics: ["quick-commerce", "space-travel", "quick-commerce"],
    brands: [{ name: "Razorpay", mention_type: "sponsor_disclosure", evidence: "Sponsored by Razorpay" }],
  }, src, ["Akshay Datt"], ["quick-commerce", "other"]);
  it("keeps verified guest", () => expect(out.guests.map((g) => g.key)).toEqual(["aadit palicha"]));
  it("drops host and unverifiable guest", () =>
    expect(out.dropped.filter((d) => d.type === "guest").map((d) => d.reason)).toEqual(["host", "evidence"]));
  it("filters topics to taxonomy, deduped", () => expect(out.topics).toEqual(["quick-commerce"]));
  it("keeps sponsor", () => expect(out.brands[0]).toMatchObject({ key: "razorpay", mention_type: "sponsor_disclosure" }));
});

describe("normalizeName initials", () => {
  it("dots and spacing in initials collapse", () =>
    expect(normalizeName("Dr. C.M. Parameshwara")).toBe(normalizeName("C. M. Parameshwara")));
});

describe("verifyExtraction dedupe rules", () => {
  const src = "Title: X\n\nDownload Porter here. This episode is brought to you by Porter. Subscribe to Figuring Out. Porter is great.";
  const out = verifyExtraction({
    topics: ["other", "fintech"],
    brands: [
      { name: "Porter", mention_type: "organic", evidence: "Porter is great" },
      { name: "Porter", mention_type: "paid_read", evidence: "Download Porter here" },
      { name: "Porter", mention_type: "sponsor_disclosure", evidence: "brought to you by Porter" },
      { name: "Figuring Out", mention_type: "organic", evidence: "Subscribe to Figuring Out" },
    ],
  }, src, [], ["fintech", "other"], "Figuring Out");
  it("one mention per brand, paid wins", () => expect(out.brands).toEqual([
    { name: "Porter", key: "porter", mention_type: "paid_read", evidence: "Download Porter here" },
  ]));
  it("show is not its own brand", () => expect(out.dropped).toContainEqual(expect.objectContaining({ name: "Figuring Out", reason: "self" })));
  it("other dropped next to real topic", () => expect(out.topics).toEqual(["fintech"]));
});

describe("entities and own-product promos", () => {
  it("matches across HTML entities", () =>
    expect(evidenceFound("Founder & Managing Partner at Kae Capital", "Sasha Mirchandani Founder &amp; Managing Partner at Kae Capital")).toBe(true));
  it("numeric entities", () => expect(evidenceFound("India's", "India&#39;s rarest")).toBe(true));
  const src = "Title: X\n\nDownload my meditation app, Swa:aha. Thanks to our sponsor Zepto.";
  const out = verifyExtraction({ brands: [
    { name: "Swa:aha", mention_type: "paid_read", evidence: "Download my meditation app, Swa:aha" },
    { name: "Zepto", mention_type: "sponsor_disclosure", evidence: "Thanks to our sponsor Zepto" },
  ] }, src, [], []);
  it("host's own app is organic", () => expect(out.brands[0].mention_type).toBe("organic"));
  it("'our sponsor' stays paid", () => expect(out.brands[1].mention_type).toBe("sponsor_disclosure"));
});
