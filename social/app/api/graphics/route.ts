import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/access";
import { serviceClient, supabaseConfigured } from "@/lib/supabase/server";
import { renderGraphic, GraphicError } from "@/lib/graphics/render";
import { saveGraphic } from "@/lib/graphics/store";
import { Spec } from "@/lib/graphics/spec";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = Spec.extend({ content_id: z.string().uuid().optional() });

/** Renders a graphic and saves it in the Asset Library (optionally attached to a draft). */
export async function POST(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "Το Supabase δεν είναι ρυθμισμένο" }, { status: 503 });
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Μόνο για admins" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρο αίτημα" }, { status: 400 });
  const { content_id, ...spec } = parsed.data;
  const db = serviceClient();
  const { data: settings } = await db.from("social_settings").select("brand_name,colors,website,hashtags,timezone").single();
  if (!settings) return NextResponse.json({ error: "Λείπει το migration" }, { status: 503 });
  try {
    const r = await renderGraphic(db, spec, settings);
    const saved = await saveGraphic(db, r, spec, content_id);
    await logActivity({ actorType: "user", actorId: admin.userId, action: "graphic.created", targetType: "asset", targetId: saved.asset_id, details: { ...spec, content_id } });
    return NextResponse.json({ ok: true, asset_id: saved.asset_id, title: r.title });
  } catch (e) {
    if (e instanceof GraphicError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("graphic save failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
