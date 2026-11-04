import { NextResponse } from "next/server";
import { z } from "zod";
import { billToProfile, billToRow, loadProfile, matchTariff, saveProfile } from "@/lib/account";
import { db } from "@/lib/db";
import { loadTariffs } from "@/lib/tariffs";
import type { Bill } from "@/lib/types";
import { userRoute } from "@/lib/user-auth";

export const runtime = "nodejs";

const num = z.number().finite().nullable().optional();
const BillInput = z.object({
  provider: z.string().max(100).nullable(), program_name: z.string().max(200).nullable(),
  tariff_color: z.enum(["blue", "green", "yellow", "orange"]).nullable(),
  period_start: z.string().max(20).nullable(), period_end: z.string().max(20).nullable(),
  billing_days: num, kwh_total: num, kwh_day: num, kwh_night: num, kwh_rate: num, kwh_rate_night: num, fixed_monthly_fee: num,
  energy_charge_gross: num, consistency_discount: num, net_energy_charge: num, supplier_total: num, regulated_total: num,
  municipal_total: num, efk_total: num, vat_amount: num, total_due: num, is_estimate: z.boolean().nullable().optional(),
  promo_discount: num, network_charges: num, system_charges: num, pso_charges: num, etmear: num, other_regulated: num,
  special_levy: num, ert_fee: num, previous_balance: num, payments_received: num, credits: num, deposit: num, other_charges: num,
}).passthrough();

/** Save an analysed bill to the history, and update the energy profile from it ({ bill, updateProfile }). */
export const POST = userRoute(async (req, user) => {
  const body = await req.json().catch(() => ({}));
  const parsed = BillInput.safeParse(body.bill);
  if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρος λογαριασμός" }, { status: 400 });
  const bill = { ...parsed.data } as unknown as Bill;
  for (const k of Object.keys(bill) as (keyof Bill)[]) if (bill[k] === undefined) (bill as unknown as Record<string, unknown>)[k] = null;
  if (!bill.kwh_total || bill.kwh_total <= 0) return NextResponse.json({ error: "Ο λογαριασμός δεν έχει κατανάλωση" }, { status: 400 });

  let profile = await loadProfile(user.id);
  if (body.updateProfile !== false) {
    const { tariffs } = await loadTariffs("electricity");
    profile = await saveProfile(user.id, billToProfile(bill, matchTariff(tariffs, bill.provider, bill.program_name)));
  }
  const row = billToRow(bill);
  // The same bill twice (same period) replaces the earlier copy.
  if (row.period_end) await db().from("user_bills").delete().eq("user_id", user.id).eq("period_end", row.period_end).eq("kwh_total", row.kwh_total as number);
  const { data, error } = await db().from("user_bills").insert({ ...row, user_id: user.id, profile_id: profile?.id ?? null }).select().single();
  if (error) throw new Error(error.message);
  return NextResponse.json({ bill: data, profile }, { status: 201 });
});
