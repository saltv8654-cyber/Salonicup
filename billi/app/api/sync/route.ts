import { NextRequest, NextResponse } from "next/server";
import { loadTariffs, saveTariffs } from "@/lib/tariffs";
import { syncTariffs, type SyncModel } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Tariff refresh, run on demand: open /api/sync?key=$CRON_SECRET (add &model=sonnet for the thorough,
 * pricier run). `Authorization: Bearer $CRON_SECRET` also works, so a Vercel Cron can be added back later.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.nextUrl.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Δεν έχει συνδεθεί Vercel Blob store" }, { status: 500 });
  }

  const previous = await loadTariffs();
  const model: SyncModel = req.nextUrl.searchParams.get("model") === "sonnet" ? "sonnet" : "haiku";
  const next = await syncTariffs(previous, model);
  if (next.tariffs.length === 0) {
    return NextResponse.json({ error: "Δεν βρέθηκαν τιμές από κανέναν πάροχο", errors: next.errors }, { status: 502 });
  }
  await saveTariffs(next);

  const perProvider: Record<string, number> = {};
  for (const t of next.tariffs) perProvider[t.provider] = (perProvider[t.provider] ?? 0) + 1;
  return NextResponse.json({ model, updated_at: next.updated_at, total: next.tariffs.length, perProvider, errors: next.errors });
}
