// Usage: npm run backfill [-- --ingest-only | --extract-only] [-- --retry-failed]
import { config } from "dotenv";
config({ path: ".env.local" });
import { ingestAll } from "../src/lib/ingest";
import { extractBatch, loadExtractCfg, requeueFailed } from "../src/lib/extract";

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--extract-only")) {
    const { errors } = await ingestAll({ youtubeMaxPages: 30, log: console.log });
    console.log(errors.length ? `Errors:\n${errors.join("\n")}` : "No errors");
  }
  if (args.includes("--ingest-only")) return;

  if (args.includes("--retry-failed")) console.log(`Requeued ${await requeueFailed()} failed episodes`);
  // Local script, so no timeout: run capped batches back to back until the queue is empty or Gemini rate-limits us.
  const { batchSize, maxCalls } = await loadExtractCfg();
  for (let batch = 1; ; batch++) {
    const s = await extractBatch({ limit: batchSize, maxCalls, log: console.log });
    console.log(`Batch ${batch}: ${s.extracted} extracted, ${s.failed} failed, ${s.geminiCalls} Gemini calls, ${s.remaining} left (${s.stopReason})`);
    if (s.stopReason === "rate_limited" || s.stopReason === "done" || s.processed === 0) break;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
