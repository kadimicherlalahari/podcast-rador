import { checkCronAuth } from "@/lib/auth";
import { weeklyRefresh } from "@/lib/weekly";

export const maxDuration = 300;

// Mondays 07:00 IST (vercel.json): fresh episodes, extraction and research ahead of the 08:00 brief.
async function run(req: Request) {
  if (!checkCronAuth(req)) return new Response("Unauthorized", { status: 401 });
  const stages = await weeklyRefresh(270_000);
  return Response.json({ stages }, { status: stages.every((s) => s.ok) ? 200 : 207 });
}

export { run as GET, run as POST };
