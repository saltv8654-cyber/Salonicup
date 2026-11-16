import { NextResponse } from "next/server";
import { enqueueDueSchedules, processJobs } from "@/lib/jobs/worker";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Called by Vercel Cron and/or Supabase pg_cron with "Authorization: Bearer $CRON_SECRET".
async function tick(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const workerId = `vercel-${Math.random().toString(36).slice(2, 10)}`;
  const enqueued = await enqueueDueSchedules();
  const jobs = await processJobs(workerId, 230_000);
  return NextResponse.json({ ok: true, enqueued, jobs });
}
export const GET = tick;
export const POST = tick;
