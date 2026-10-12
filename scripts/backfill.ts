// Usage: npm run backfill [-- --ingest-only]
import { config } from "dotenv";
config({ path: ".env.local" });
import { ingestAll } from "../src/lib/ingest";

async function main() {
  const ingestOnly = process.argv.includes("--ingest-only");
  const { errors } = await ingestAll({ youtubeMaxPages: 30, log: console.log });
  console.log(errors.length ? `Errors:\n${errors.join("\n")}` : "No errors");
  if (ingestOnly) return;
  // TODO(Phase 3): run extraction in capped batches here, respecting Gemini rate limits.
  console.log("Extraction not implemented yet (Phase 3).");
}

main().catch((e) => { console.error(e); process.exit(1); });
