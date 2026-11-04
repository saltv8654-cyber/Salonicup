import { NextRequest } from "next/server";
import { cronResponse } from "@/lib/energy/cron";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Old address of the tariff refresh, kept so saved links keep working. Changes now wait for approval in the CRM. */
export const GET = (req: NextRequest) => cronResponse(req);
