import { NextResponse } from "next/server";
import { loadTariffs } from "@/lib/tariffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public tariff catalogue for the "programmes per provider" view. */
export async function GET() {
  const { updated_at, tariffs } = await loadTariffs();
  return NextResponse.json({ updated_at, tariffs });
}
