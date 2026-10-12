// Stage 6b locally: YouTube stats + comments, then Gemini profiles, video analysis and topic briefs (capped, cached).
// Usage: npm run insights
import { config } from "dotenv";
config({ path: ".env.local" });
import { runInsights } from "../src/lib/insights";

runInsights({ log: console.log })
  .then((s) => console.log(`\n${s.generated} generated, ${s.geminiCalls} Gemini calls, ~${s.youtubeUnits} YouTube units, stop: ${s.stopReason}${s.errors.length ? `\nErrors:\n${s.errors.join("\n")}` : ""}`))
  .catch((e) => { console.error(e); process.exit(1); });
