import { NextResponse } from "next/server";
import { ProfileInput, SettingsInput, matchTariff, saveProfile } from "@/lib/account";
import { db } from "@/lib/db";
import { loadTariffs } from "@/lib/tariffs";
import { userRoute } from "@/lib/user-auth";

export const runtime = "nodejs";

/** { profile?: energy profile fields, settings?: notification preferences } */
export const PUT = userRoute(async (req, user) => {
  const body = await req.json().catch(() => ({}));
  const out: Record<string, unknown> = {};
  if (body.profile !== undefined) {
    const p = ProfileInput.safeParse(body.profile);
    if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
    const { tariffs } = await loadTariffs("electricity");
    const t = matchTariff(tariffs, p.data.provider, p.data.program_name);
    out.profile = await saveProfile(user.id, { ...p.data, tariff_id: t?.id ?? null });
  }
  if (body.settings !== undefined) {
    const s = SettingsInput.safeParse(body.settings);
    if (!s.success) return NextResponse.json({ error: s.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία" }, { status: 400 });
    const { data, error } = await db().from("user_profiles").upsert({ user_id: user.id, ...s.data, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select().single();
    if (error) throw new Error(error.message);
    out.settings = data;
  }
  return NextResponse.json(out);
});
