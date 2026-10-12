// Stage 7 locally: build this week's brief (Gemini writes prose + outreach drafts) and email it.
// Usage: npm run brief [-- --no-email] [-- --preview out.html]
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { buildBrief, emailBrief, renderBriefEmail } from "../src/lib/brief";

async function main() {
  const args = process.argv.slice(2);
  const { id, data } = await buildBrief();
  console.log(`Brief ${id}: ${data.guests.length} guests, ${data.topics.length} topics, ${data.brands.length} brands, ${data.topEpisodes.length} episodes`);
  const i = args.indexOf("--preview");
  if (i >= 0) {
    writeFileSync(args[i + 1], renderBriefEmail(data).html);
    console.log(`Preview written to ${args[i + 1]}`);
  }
  if (args.includes("--no-email")) return;
  const sent = await emailBrief(id);
  console.log(`Emailed to ${sent.to} (Resend id ${sent.resendId})`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
