import { NextRequest, NextResponse } from "next/server";
import { loadTariffs, saveTariffs } from "@/lib/tariffs";
import { syncTariffs } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily tariff refresh, called by Vercel Cron (see vercel.json). */
export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anyone else is turned away.
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Δεν έχει συνδεθεί Vercel Blob store" }, { status: 500 });
  }

  const previous = await loadTariffs();
  const next = await syncTariffs(previous);
  if (next.tariffs.length === 0) {
    return NextResponse.json({ error: "Δεν βρέθηκαν τιμές από κανέναν πάροχο", errors: next.errors }, { status: 502 });
  }
  await saveTariffs(next);

  const perProvider: Record<string, number> = {};
  for (const t of next.tariffs) perProvider[t.provider] = (perProvider[t.provider] ?? 0) + 1;
  return NextResponse.json({ updated_at: next.updated_at, total: next.tariffs.length, perProvider, errors: next.errors });
}
