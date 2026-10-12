/**
 * Web sources for guest research and the trend check, used when Gemini's own Google Search grounding isn't
 * available on the key. Gemini then writes only from these documents, and every one is shown as a source.
 *   - Wikipedia: free, no key. Good for well-known guests.
 *   - Tavily (TAVILY_API_KEY): general web + news search built for LLM use. Optional; skipped when unset.
 */

export type WebDoc = { title: string; url: string; content: string; date?: string; source: "wikipedia" | "tavily" };

const UA = "PodcastRadar/0.1 (founder research prototype)";

export const tavilyEnabled = () => !!process.env.TAVILY_API_KEY;
/** Gemini's built-in Google Search needs a billing-enabled key; opt in explicitly so a free key doesn't burn requests on 429s. */
export const geminiGroundingEnabled = () => process.env.GEMINI_SEARCH_GROUNDING === "true";

/** Best-matching English Wikipedia article for a person, only if its title contains their surname. */
export async function wikipediaPerson(name: string, context = ""): Promise<WebDoc | null> {
  const api = "https://en.wikipedia.org/w/api.php";
  const search = await fetch(`${api}?${new URLSearchParams({
    action: "query", list: "search", srsearch: `${name} ${context}`.trim(), srlimit: "3", format: "json", origin: "*",
  })}`, { headers: { "User-Agent": UA } });
  if (!search.ok) return null;
  const surname = name.trim().split(/\s+/).pop()!.toLowerCase();
  const hit = ((await search.json()).query?.search ?? []).find((h: { title: string }) => h.title.toLowerCase().includes(surname));
  if (!hit) return null;
  const page = await fetch(`${api}?${new URLSearchParams({
    action: "query", prop: "extracts", explaintext: "1", titles: hit.title, format: "json", origin: "*", redirects: "1",
  })}`, { headers: { "User-Agent": UA } });
  if (!page.ok) return null;
  const pages = (await page.json()).query?.pages ?? {};
  const p = Object.values(pages)[0] as { title?: string; extract?: string } | undefined;
  if (!p?.extract) return null;
  return {
    title: `${p.title} - Wikipedia`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title!.replace(/ /g, "_"))}`,
    content: p.extract.slice(0, 9000), source: "wikipedia", // lead + early sections is plenty for a profile
  };
}

/** Tavily search. Returns [] without a key, so callers can treat it as optional. */
export async function tavilySearch(query: string, opts: { news?: boolean; days?: number; max?: number } = {}): Promise<WebDoc[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query, search_depth: "basic", max_results: opts.max ?? 8, include_answer: false,
      ...(opts.news ? { topic: "news", days: opts.days ?? 14 } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return (data.results ?? []).map((r: { title?: string; url: string; content?: string; published_date?: string }) => ({
    title: r.title ?? r.url, url: r.url, content: (r.content ?? "").slice(0, 1500), source: "tavily" as const,
    // Tavily sends RFC 2822 dates ("Tue, 29 Sep 2026 ..."); store ISO so prompts get YYYY-MM-DD.
    date: r.published_date && !Number.isNaN(Date.parse(r.published_date)) ? new Date(r.published_date).toISOString() : undefined,
  }));
}

/** Documents as numbered prompt text, so Gemini can say which ones it used. */
export function docsPrompt(docs: WebDoc[]): string {
  return docs.map((d, i) => `[${i + 1}] ${d.title}${d.date ? ` (${d.date.slice(0, 10)})` : ""}\n${d.url}\n${d.content}`).join("\n\n");
}
