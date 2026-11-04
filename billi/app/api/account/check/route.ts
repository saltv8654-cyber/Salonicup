import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alerts";
import { userRoute } from "@/lib/user-auth";

export const runtime = "nodejs";

/** Check my alerts now (otherwise it happens every morning). */
export const POST = userRoute(async (_req, user) => NextResponse.json(await runAlerts(user.id)));
