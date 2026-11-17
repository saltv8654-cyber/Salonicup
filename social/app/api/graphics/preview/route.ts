import { getAdmin } from "@/lib/access";
import { serviceClient, supabaseConfigured } from "@/lib/supabase/server";
import { renderGraphic, GraphicError } from "@/lib/graphics/render";
import { specFromParams } from "@/lib/graphics/spec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** PNG preview for the Creative Studio. Nothing is stored. */
export async function GET(req: Request) {
  if (!supabaseConfigured()) return new Response("Supabase is not configured", { status: 503 });
  if (!(await getAdmin())) return new Response("Μόνο για admins", { status: 403 });
  const spec = specFromParams(new URL(req.url).searchParams);
  if (!spec.success) return new Response("Μη έγκυρες παράμετροι", { status: 400 });
  const db = serviceClient();
  const { data: settings } = await db.from("social_settings").select("brand_name,colors,website,hashtags,timezone").single();
  if (!settings) return new Response("Λείπει το migration", { status: 503 });
  try {
    const r = await renderGraphic(db, spec.data, settings);
    return new Response(new Uint8Array(r.png), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof GraphicError) return new Response(e.message, { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } });
    console.error("graphic preview failed", e);
    return new Response("Η δημιουργία απέτυχε", { status: 500 });
  }
}
