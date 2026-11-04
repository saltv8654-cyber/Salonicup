import { z } from "zod";
import { logActivity } from "../audit";
import { db } from "../db";
import { slug } from "../tariff-input";
import {
  DETAIL_FIELDS, PRICE_FIELDS, SOURCE_FLAG_CODES, changedFields, thisMonth,
  type Flag, type Provider, type QueueItem, type TariffValues,
} from "./model";
import { hasErrors, validateValues } from "./validate";

const nullableText = z.string().trim().max(500).nullable().transform((v) => (v ? v : null));
export const TariffValuesSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  color: z.enum(["blue", "green", "yellow", "orange"]).nullable(),
  segment: z.enum(["residential", "business"]),
  fixed_monthly_eur: z.number().nullable(),
  price_per_kwh_eur: z.number().nullable(),
  day_night: z.boolean(),
  price_per_kwh_night_eur: z.number().nullable(),
  price_per_kwh_with_discount_eur: z.number().nullable(),
  discount_condition: nullableText,
  promo_discount: nullableText,
  min_duration_months: z.number().nullable(),
  early_termination_fee: nullableText,
  conditions: nullableText,
  valid_from: nullableText,
  valid_until: nullableText,
  valid_month: nullableText,
  url: nullableText,
});

const SOURCE_FLAGS = new Set(SOURCE_FLAG_CODES);

export function reflag(item: QueueItem, values: TariffValues | null): Flag[] {
  const kept = (item.flags ?? []).filter((f) => SOURCE_FLAGS.has(f.code));
  return values ? [...validateValues(values, item.old_values), ...kept] : kept;
}

function tariffColumns(v: TariffValues) {
  return {
    provider: v.provider, name: v.name, color: v.color, segment: v.segment,
    fixed_monthly_eur: v.fixed_monthly_eur, price_per_kwh_eur: v.price_per_kwh_eur,
    day_night: v.day_night, price_per_kwh_night_eur: v.day_night ? v.price_per_kwh_night_eur : null,
    price_per_kwh_with_discount_eur: v.price_per_kwh_with_discount_eur, discount_condition: v.discount_condition,
    promo_discount: v.promo_discount, min_duration_months: v.min_duration_months,
    early_termination_fee: v.early_termination_fee, conditions: v.conditions,
    valid_from: v.valid_from, valid_until: v.valid_until,
    valid_month: v.valid_month ?? v.valid_from?.slice(0, 7) ?? thisMonth(),
    url: v.url,
  };
}

async function providerFor(item: QueueItem, name: string): Promise<string> {
  if (item.provider_id) return item.provider_id;
  const { data } = await db().from("energy_providers").select("*");
  const found = ((data ?? []) as Provider[]).find((p) => p.name === name || p.aliases.includes(name));
  if (found) return found.id;
  const { data: created, error } = await db()
    .from("energy_providers")
    .insert({ slug: slug(name) || `provider-${Date.now().toString(36)}`, name, aliases: [name] })
    .select("id")
    .single();
  if (error || !created) throw new Error(`Δεν δημιουργήθηκε ο πάροχος: ${error?.message}`);
  return (created as { id: string }).id;
}

export class ReviewError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function loadPending(id: string): Promise<QueueItem> {
  const { data, error } = await db().from("tariff_update_queue").select("*").eq("id", id).maybeSingle();
  if (error) throw new ReviewError(error.message, 500);
  if (!data) throw new ReviewError("Η αλλαγή δεν βρέθηκε", 404);
  const item = data as QueueItem;
  if (item.status !== "pending") throw new ReviewError("Η αλλαγή έχει ήδη εξεταστεί", 409);
  return item;
}

/** Save the administrator's corrections to a pending change (it stays pending). */
export async function editPending(id: string, admin: string, values: TariffValues | null, notes?: string | null) {
  const item = await loadPending(id);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (values && item.change_type !== "discontinued") {
    patch.new_values = values;
    patch.flags = reflag(item, values);
    if (item.old_values) patch.changed_fields = [...changedFields(item.old_values, values, PRICE_FIELDS), ...changedFields(item.old_values, values, DETAIL_FIELDS)];
  }
  if (notes !== undefined) patch.notes = notes;
  const { data, error } = await db().from("tariff_update_queue").update(patch).eq("id", id).select().single();
  if (error) throw new ReviewError(error.message, 500);
  await logActivity({
    admin, action: values ? "queue_edit" : "queue_note", entity: "tariff_update_queue", entity_id: id,
    before: values ? item.new_values : { notes: item.notes }, after: values ?? { notes },
    source_url: item.source_url, source_document: item.source_document,
  });
  return data as QueueItem;
}

/** Writes one approved change to `tariffs`. */
async function writeChange(item: QueueItem, values: TariffValues | null, admin: string, now: string) {
  const verified = { data_status: "verified", last_verified_at: now, updated_by: admin, updated_at: now };
  let before: unknown = null;
  if (item.tariff_id) {
    const { data: cur } = await db().from("tariffs").select("*").eq("id", item.tariff_id).maybeSingle();
    if (!cur) throw new ReviewError("Το δημοσιευμένο πρόγραμμα δεν υπάρχει πια. Απόρριψε την αλλαγή.", 409);
    before = cur;
  }

  let tariffId = item.tariff_id!;
  let query;
  if (item.change_type === "new") {
    const providerId = await providerFor(item, values!.provider);
    tariffId = `${slug(values!.provider)}-${slug(values!.name)}-${Date.now().toString(36)}`;
    query = db().from("tariffs").insert({
      id: tariffId, category: "electricity", active: true, provider_id: providerId, source_id: item.source_id,
      ...tariffColumns(values!), ...verified,
    });
  } else if (item.change_type === "discontinued") {
    query = db().from("tariffs").update({ active: false, updated_by: admin, updated_at: now }).eq("id", tariffId);
  } else {
    query = db().from("tariffs").update({ ...tariffColumns(values!), source_id: item.source_id, ...verified }).eq("id", tariffId);
  }
  const { data: after, error } = await query.select().single();
  if (error) throw new ReviewError(error.message, 500);
  return { tariffId, before, after };
}

/** Publish a pending change to the public catalogue. History rows are written by the database trigger. */
export async function approve(id: string, admin: string, opts: { values?: TariffValues; notes?: string | null } = {}) {
  const item = await loadPending(id);
  const values = item.change_type === "discontinued" ? null : opts.values ?? item.new_values;
  if (item.change_type !== "discontinued") {
    if (!values) throw new ReviewError("Δεν υπάρχουν τιμές για δημοσίευση");
    const flags = reflag(item, values);
    if (hasErrors(flags)) throw new ReviewError(`Διόρθωσε πρώτα: ${flags.filter((f) => f.level === "error").map((f) => f.message).join(" · ")}`);
  }

  // Claim the item first so two administrators can't publish it twice.
  const now = new Date().toISOString();
  const { data: claimed } = await db()
    .from("tariff_update_queue")
    .update({ status: "approved", reviewed_by: admin, reviewed_at: now, updated_at: now })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) throw new ReviewError("Η αλλαγή εξετάστηκε μόλις από άλλον διαχειριστή", 409);

  let result: Awaited<ReturnType<typeof writeChange>>;
  try {
    result = await writeChange(item, values, admin, now);
  } catch (e) {
    await db().from("tariff_update_queue").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", id);
    throw e;
  }

  const { error: qErr } = await db()
    .from("tariff_update_queue")
    .update({ tariff_id: result.tariffId, ...(values ? { new_values: values } : {}), ...(opts.notes !== undefined ? { notes: opts.notes } : {}) })
    .eq("id", id);
  if (qErr) console.error("approve: queue update failed", qErr.message);

  await logActivity({
    admin, action: `approve_${item.change_type}`, entity: "tariffs", entity_id: result.tariffId,
    before: result.before, after: result.after, source_url: item.source_url, source_document: item.source_document,
    note: opts.notes ?? item.notes,
  });
  return { tariff_id: result.tariffId };
}

export async function reject(id: string, admin: string, notes?: string | null) {
  const item = await loadPending(id);
  const now = new Date().toISOString();
  const { error } = await db()
    .from("tariff_update_queue")
    .update({ status: "rejected", reviewed_by: admin, reviewed_at: now, updated_at: now, ...(notes !== undefined ? { notes } : {}) })
    .eq("id", id);
  if (error) throw new ReviewError(error.message, 500);
  await logActivity({
    admin, action: `reject_${item.change_type}`, entity: "tariff_update_queue", entity_id: id,
    before: item.old_values, after: item.new_values, source_url: item.source_url, source_document: item.source_document,
    note: notes ?? item.notes,
  });
}
