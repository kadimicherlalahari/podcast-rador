import { checkCronAuth } from "@/lib/auth";
import { runInsights } from "@/lib/insights";

export const maxDuration = 300;

async function run(req: Request) {
  if (!checkCronAuth(req)) return new Response("Unauthorized", { status: 401 });
  // Video analysis calls can take a minute each, so stop starting new work after 4 min.
  return Response.json(await runInsights({ deadlineMs: 240_000 }));
}

export { run as GET, run as POST };
