import { checkCronAuth } from "@/lib/auth";
import { weeklyBrief } from "@/lib/weekly";

export const maxDuration = 300;

// Mondays 08:00 IST (vercel.json). Add ?force=1 to send again within 12 hours of the last brief.
async function run(req: Request) {
  if (!checkCronAuth(req)) return new Response("Unauthorized", { status: 401 });
  const r = await weeklyBrief({ force: new URL(req.url).searchParams.get("force") === "1" });
  return Response.json(r, { status: r.ok ? 200 : 502 });
}

export { run as GET, run as POST };
