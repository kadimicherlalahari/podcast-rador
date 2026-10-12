import { checkCronAuth } from "@/lib/auth";
import { ingestAll } from "@/lib/ingest";

export const maxDuration = 300;

async function run(req: Request) {
  if (!checkCronAuth(req)) return new Response("Unauthorized", { status: 401 });
  const { perShow, errors } = await ingestAll({ youtubeMaxPages: 1 });
  return Response.json({ perShow, errors });
}

export { run as GET, run as POST };
