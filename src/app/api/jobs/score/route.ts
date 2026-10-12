import { checkCronAuth } from "@/lib/auth";
import { resolveEntities } from "@/lib/resolve";
import { computeScores } from "@/lib/score";

export const maxDuration = 300;

async function run(req: Request) {
  if (!checkCronAuth(req)) return new Response("Unauthorized", { status: 401 });
  // Resolve first so merged guests/brands are counted once; stop asking Gemini after 4 min.
  const resolve = await resolveEntities({ deadlineMs: 240_000 });
  return Response.json({ resolve, scores: await computeScores() });
}

export { run as GET, run as POST };
