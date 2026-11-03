import { NextRequest, NextResponse } from "next/server";
import { loadTariffs, loadTelecom } from "@/lib/tariffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public tariff catalogue for the "programmes per provider" view. */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  if (category === "telecom") {
    const { updated_at, plans } = await loadTelecom();
    return NextResponse.json({ updated_at, plans });
  }
  const { updated_at, tariffs } = await loadTariffs(category === "gas" ? "gas" : "electricity");
  return NextResponse.json({ updated_at, tariffs });
}
