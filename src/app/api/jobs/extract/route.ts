import { checkCronAuth } from "@/lib/auth";
import { extractBatch } from "@/lib/extract";

export const maxDuration = 300;

async function run(req: Request) {
  if (!checkCronAuth(req)) return new Response("Unauthorized", { status: 401 });
  // Stop starting new episodes after 4 min so a slow Gemini call can't push past maxDuration.
  return Response.json(await extractBatch({ deadlineMs: 240_000 }));
}

export { run as GET, run as POST };
