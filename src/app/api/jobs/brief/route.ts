import { checkCronAuth } from "@/lib/auth";
import { buildBrief, emailBrief } from "@/lib/brief";

export const maxDuration = 300;

async function run(req: Request) {
  if (!checkCronAuth(req)) return new Response("Unauthorized", { status: 401 });
  const { id } = await buildBrief();
  try {
    return Response.json({ id, emailed: await emailBrief(id) });
  } catch (e) {
    return Response.json({ id, emailError: (e as Error).message }, { status: 502 });
  }
}

export { run as GET, run as POST };
