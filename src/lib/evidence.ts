// Pure helpers for Stage 3: name normalization and the evidence (hallucination) guard.

const HONORIFICS = /^(?:dr|mr|mrs|ms|shri|smt|sri|prof|adv)\s+/;

/** Deterministic entity key: lowercase, no honorifics, no bracketed text, collapsed whitespace. */
export function normalizeName(name: string): string {
  let s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}&+\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  while (HONORIFICS.test(s)) s = s.replace(HONORIFICS, "");
  return s.replace(/['-]+$/g, "").trim();
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: "..." };

/** Decodes the HTML entities feeds leave in descriptions (&amp;, &#39;, &#x2019;, ...). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Case-insensitive, whitespace-normalized text used for evidence matching. Entities, curly quotes and dashes are folded. */
export function normalizeText(s: string): string {
  return decodeEntities(s)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function evidenceFound(evidence: string, source: string): boolean {
  const e = normalizeText(evidence);
  return e.length >= 3 && normalizeText(source).includes(e);
}

export type MentionType = "paid_read" | "sponsor_disclosure" | "organic";
export type RawExtraction = {
  guests?: { name?: string; company?: string; role?: string; evidence?: string }[];
  topics?: string[];
  brands?: { name?: string; mention_type?: string; evidence?: string }[];
};
export type Guest = { name: string; key: string; company: string | null; role: string | null; evidence: string };
export type Brand = { name: string; key: string; mention_type: MentionType; evidence: string };
export type Dropped = { type: "guest" | "brand" | "topic"; name: string; evidence?: string; reason: "evidence" | "host" | "self" | "taxonomy" | "empty" };
export type Verified = { guests: Guest[]; topics: string[]; brands: Brand[]; dropped: Dropped[] };

const MENTION_TYPES = new Set<MentionType>(["paid_read", "sponsor_disclosure", "organic"]);
const clean = (s: string | undefined) => (s ?? "").trim();

/**
 * Applies the deterministic guards to Gemini's output: every guest/brand must quote the source text,
 * hosts are never guests, the show is never its own brand, topics must come from the taxonomy.
 * Anything that fails is returned in `dropped`.
 */
export function verifyExtraction(
  raw: RawExtraction, source: string, hostNames: string[], taxonomy: string[], showName = "",
): Verified {
  const out: Verified = { guests: [], topics: [], brands: [], dropped: [] };
  const hosts = new Set(hostNames.map(normalizeName));
  const seenGuests = new Set<string>();
  for (const g of raw.guests ?? []) {
    const name = clean(g.name), evidence = clean(g.evidence), key = normalizeName(name);
    if (!key) { out.dropped.push({ type: "guest", name, evidence, reason: "empty" }); continue; }
    if (hosts.has(key)) { out.dropped.push({ type: "guest", name, evidence, reason: "host" }); continue; }
    if (!evidenceFound(evidence, source)) { out.dropped.push({ type: "guest", name, evidence, reason: "evidence" }); continue; }
    if (seenGuests.has(key)) continue;
    seenGuests.add(key);
    out.guests.push({ name, key, company: clean(g.company) || null, role: clean(g.role) || null, evidence });
  }
  for (const b of raw.brands ?? []) {
    const name = clean(b.name), evidence = clean(b.evidence), key = normalizeName(name);
    let type = (MENTION_TYPES.has(b.mention_type as MentionType) ? b.mention_type : "organic") as MentionType;
    // "Download my app" / "our course" is the host promoting their own product, not a third-party sponsor.
    if (type !== "organic" && /\b(?:my|our)\b/i.test(evidence) && !/sponsor|partner|brought to you|#ad\b/i.test(evidence)) type = "organic";
    if (!key) { out.dropped.push({ type: "brand", name, evidence, reason: "empty" }); continue; }
    if (key === normalizeName(showName)) { out.dropped.push({ type: "brand", name, evidence, reason: "self" }); continue; }
    if (!evidenceFound(evidence, source)) { out.dropped.push({ type: "brand", name, evidence, reason: "evidence" }); continue; }
    // One mention per brand per episode: a paid type beats organic, and paid_read/sponsor_disclosure never both count.
    const prev = out.brands.find((x) => x.key === key);
    if (prev) {
      if (prev.mention_type === "organic" && type !== "organic") Object.assign(prev, { mention_type: type, evidence });
      continue;
    }
    out.brands.push({ name, key, mention_type: type, evidence });
  }
  const allowed = new Set(taxonomy);
  for (const t of raw.topics ?? []) {
    const slug = clean(t).toLowerCase();
    if (!allowed.has(slug)) { out.dropped.push({ type: "topic", name: slug, reason: "taxonomy" }); continue; }
    if (!out.topics.includes(slug)) out.topics.push(slug);
  }
  // "other" means nothing in the taxonomy fits, so it can't sit next to a real topic.
  if (out.topics.length > 1) out.topics = out.topics.filter((t) => t !== "other");
  return out;
}
