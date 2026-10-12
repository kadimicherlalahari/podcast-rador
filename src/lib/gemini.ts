import { GoogleGenAI } from "@google/genai";

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

/**
 * One JSON-mode generateContent call with exponential backoff on 429/5xx.
 * `onAttempt` is called for every HTTP request so callers can enforce a per-run call cap.
 */
export async function generateJson<T>(opts: {
  system: string; prompt: string; schema: object; onAttempt?: () => void; retries?: number;
  onRetry?: (status: number, waitMs: number) => void;
}): Promise<T> {
  const retries = opts.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    opts.onAttempt?.();
    try {
      const res = await ai().models.generateContent({
        model: geminiModel(),
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.schema,
          temperature: 0,
        },
      });
      const text = res.text;
      if (!text) throw new Error(`Empty response (finish reason: ${res.candidates?.[0]?.finishReason ?? "unknown"})`);
      return JSON.parse(text) as T;
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
