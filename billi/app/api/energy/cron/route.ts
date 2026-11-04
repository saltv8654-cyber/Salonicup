import { NextRequest } from "next/server";
import { cronResponse } from "@/lib/energy/cron";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Scheduled tariff check (Vercel Cron, pg_cron or any scheduler): Authorization: Bearer $CRON_SECRET or ?key=. */
export const GET = (req: NextRequest) => cronResponse(req);
