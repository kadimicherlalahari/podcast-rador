import { GoogleGenAI, MediaResolution, type GenerateContentResponse } from "@google/genai";

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
    // SDK retries are off: our own backoff below is the only retry loop, so every request counts toward the per-run cap.
    client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } },
    });
  }
  return client;
}

export function geminiModel(): string {
  const m = process.env.GEMINI_MODEL;
  if (!m) throw new Error("GEMINI_MODEL not set");
  return m;
}

/** Thrown when Gemini keeps returning 429 after all retries, so callers can stop the run instead of failing items. */
export class RateLimitError extends Error {}

const RETRYABLE = new Set([429, 500, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RetryOpts = { onAttempt?: () => void; retries?: number; onRetry?: (status: number, waitMs: number) => void };

/**
 * Runs one Gemini request with exponential backoff on 429/5xx.
 * `onAttempt` is called for every HTTP request so callers can enforce a per-run call cap.
 */
async function withRetry<T>(call: () => Promise<T>, opts: RetryOpts): Promise<T> {
  const retries = opts.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    opts.onAttempt?.();
    try {
      return await call();
    } catch (e) {
      const err = e as { status?: number; name?: string };
      // Timeouts surface as AbortError/TimeoutError without a status; treat them like a 504.
      const status = err.status ?? (err.name === "AbortError" || err.name === "TimeoutError" ? 504 : undefined);
      if (!status || !RETRYABLE.has(status)) throw e;
      // A daily quota (RetryInfo of minutes/hours) won't clear with backoff, so stop the run right away.
      const retryDelay = Number(/"retryDelay":"(\d+)s"/.exec((e as Error).message)?.[1] ?? 0);
      if (status === 429 && retryDelay > 120) {
        throw new RateLimitError(`Gemini quota exhausted, resets in ~${Math.ceil(retryDelay / 3600)}h`);
      }
      if (attempt >= retries) {
        if (status === 429) throw new RateLimitError(`Gemini rate limit: ${(e as Error).message.slice(0, 200)}`);
        throw e;
      }
      const wait = Math.min(60_000, 2_000 * 2 ** attempt) + Math.random() * 500;
      opts.onRetry?.(status, wait);
      await sleep(wait);
    }
  }
}

function parseJson<T>(res: GenerateContentResponse): T {
  const text = res.text;
  if (!text) throw new Error(`Empty response (finish reason: ${res.candidates?.[0]?.finishReason ?? "unknown"})`);
  // Grounded answers can arrive wrapped in a ```json fence.
  const body = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  return JSON.parse(body) as T;
}

/** One JSON-mode generateContent call over plain text. */
export async function generateJson<T>(opts: { system: string; prompt: string; schema: object } & RetryOpts): Promise<T> {
  return withRetry(async () => parseJson<T>(await ai().models.generateContent({
    model: geminiModel(),
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: opts.schema,
      temperature: 0,
    },
  })), opts);
}

export type WebSource = { title: string; uri: string };

/** JSON answer grounded with Google Search. Returns the pages Gemini actually used, so the UI can cite them. */
export async function generateGrounded<T>(opts: { system: string; prompt: string; schema: object } & RetryOpts): Promise<{ data: T; sources: WebSource[] }> {
  return withRetry(async () => {
    const res = await ai().models.generateContent({
      model: geminiModel(),
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        temperature: 0.2,
      },
    });
    const seen = new Set<string>();
    const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => ({ title: c.web?.title ?? c.web?.domain ?? "", uri: c.web?.uri ?? "" }))
      .filter((s) => s.uri && !seen.has(s.uri) && seen.add(s.uri));
    return { data: parseJson<T>(res), sources };
  }, opts);
}

/**
 * Gemini watches a public YouTube video (official fileData support, no download or scraping).
 * Low media resolution and an end offset keep a 1-2 hour episode inside free-tier token limits.
 */
export async function generateFromVideo<T>(opts: {
  videoId: string; endOffsetSec: number; system: string; prompt: string; schema: object;
} & RetryOpts): Promise<T> {
  return withRetry(async () => parseJson<T>(await ai().models.generateContent({
    model: geminiModel(),
    contents: [{
      role: "user",
      parts: [
        { fileData: { fileUri: `https://www.youtube.com/watch?v=${opts.videoId}`, mimeType: "video/*" }, videoMetadata: { endOffset: `${opts.endOffsetSec}s` } },
        { text: opts.prompt },
      ],
    }],
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: opts.schema,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
      temperature: 0,
    },
  })), { ...opts, retries: opts.retries ?? 3 });
}
