"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { RateLimitError } from "@/lib/gemini";
import { analyseEpisode, generateGuestProfile, generateGuestVideos, generateTopicBrief } from "@/lib/insights";
import { checkTrend, type TrendCheck } from "@/lib/trends";
import { buildBrief, emailBrief } from "@/lib/brief";

import type { ActionState as ResearchState } from "@/components/client";

const failure = (e: unknown): string =>
  e instanceof RateLimitError ? "Gemini's quota is used up for now. Try again later." : (e as Error).message.slice(0, 200);

async function minutes(): Promise<number> {
  const r = (await db().execute("select value from scoring_config where key = 'video_analysis_max_minutes'")).rows[0];
  return Number(r?.value ?? 40);
}

/** Web profile + other YouTube videos + Gemini watching their most-viewed episode. Each part can fail on its own. */
export async function researchGuest(_prev: ResearchState, f: FormData): Promise<ResearchState> {
  const id = String(f.get("id") ?? "");
  const errors: string[] = [];
  const top = (await db().execute({
    sql: `select e.id from appearances a join episodes e on e.id = a.episode_id
          where a.guest_id = ? and e.youtube_video_id is not null order by coalesce(e.view_count, 0) desc limit 1`,
    args: [id],
  })).rows[0]?.id as string | undefined;
  const parts: [string, () => Promise<void>][] = [
    ["Profile", () => generateGuestProfile(id)],
    ["Other YouTube videos", () => generateGuestVideos(id)],
    ...(top ? [["Video analysis", async () => analyseEpisode(top, await minutes())] as [string, () => Promise<void>]] : []),
  ];
  for (const [label, run] of parts) {
    try { await run(); } catch (e) { errors.push(`${label}: ${failure(e)}`); }
  }
  revalidatePath(`/guests/${id}`);
  revalidatePath("/rankings");
  return errors.length ? { status: "error", message: errors.join(" · ") } : { status: "done" };
}

export async function writeTopicBrief(_prev: ResearchState, f: FormData): Promise<ResearchState> {
  const slug = String(f.get("slug") ?? "");
  try {
    await generateTopicBrief(slug);
  } catch (e) {
    return { status: "error", message: failure(e) };
  }
  revalidatePath(`/topics/${slug}`);
  revalidatePath("/rankings");
  return { status: "done" };
}

export type TrendState = { status: "idle" } | { status: "done"; result: TrendCheck } | { status: "error"; message: string };

/** The chip that was clicked wins over the typed text. Cached for 6 hours per query; ~200 YouTube units per fresh check. */
export async function runTrendCheck(_prev: TrendState, f: FormData): Promise<TrendState> {
  const q = String(f.get("chip") || f.get("text") || "").trim();
  if (q.length < 2) return { status: "error", message: "Type a topic or pick one below." };
  try {
    return { status: "done", result: await checkTrend(q) };
  } catch (e) {
    return { status: "error", message: `Couldn't check "${q}": ${(e as Error).message.slice(0, 160)}` };
  }
}

/** Builds this week's brief (Gemini prose + drafts) and emails it; the brief is kept even if the email fails. */
export async function writeAndSendBrief(): Promise<ResearchState> {
  let id: string;
  try {
    id = (await buildBrief()).id;
  } catch (e) {
    return { status: "error", message: failure(e) };
  }
  revalidatePath("/pipeline");
  try {
    await emailBrief(id);
  } catch (e) {
    return { status: "error", message: `Brief saved, but the email failed: ${(e as Error).message.slice(0, 240)}` };
  }
  return { status: "done", message: "Written and emailed" };
}
