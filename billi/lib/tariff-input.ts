import { z } from "zod";

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0370-\u03ff]+/g, "-").replace(/^-|-$/g, "");

export const TariffInput = z
  .object({
    provider: z.string().trim().min(1, "Γράψε πάροχο").max(100),
    name: z.string().trim().min(1, "Γράψε όνομα προγράμματος").max(200),
    color: z.enum(["blue", "green", "yellow", "orange"]),
    fixed_monthly_eur: z.number().min(0, "Το πάγιο δεν μπορεί να είναι αρνητικό").max(50, "Πάγιο πάνω από 50 €/μήνα; Έλεγξε την τιμή"),
    price_per_kwh_eur: z.number().min(0.01, "Η τιμή kWh είναι σε € (π.χ. 0.15)").max(1, "Η τιμή kWh είναι σε €, όχι λεπτά (π.χ. 0.15)"),
    price_per_kwh_with_discount_eur: z.number().min(0.01).max(1).nullable().optional(),
    discount_condition: z.string().trim().max(300).nullable().optional(),
    min_duration_months: z.number().int().min(0).max(60).nullable().optional(),
    valid_month: z.string().regex(/^\d{4}-\d{2}$/, "Μήνας σε μορφή ΕΕΕΕ-ΜΜ"),
    url: z.union([z.literal(""), z.string().trim().url("Μη έγκυρο link").max(500)]).nullable().optional(),
    active: z.boolean().optional(),
    category: z.enum(["electricity", "gas"]).optional(),
    // Energy-data fields (optional, older forms don't send them)
    segment: z.enum(["residential", "business"]).optional(),
    day_night: z.boolean().optional(),
    price_per_kwh_night_eur: z.number().min(0.01).max(1).nullable().optional(),
    promo_discount: z.string().trim().max(300).nullable().optional(),
    early_termination_fee: z.string().trim().max(300).nullable().optional(),
    conditions: z.string().trim().max(500).nullable().optional(),
    valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ημερομηνία ΕΕΕΕ-ΜΜ-ΗΗ").nullable().optional().or(z.literal("")),
    valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ημερομηνία ΕΕΕΕ-ΜΜ-ΗΗ").nullable().optional().or(z.literal("")),
    /** "I checked this price at its official source just now" */
    verified: z.boolean().optional(),
  })
  .refine((t) => t.price_per_kwh_with_discount_eur == null || t.price_per_kwh_with_discount_eur <= t.price_per_kwh_eur, {
    message: "Η τιμή με έκπτωση πρέπει να είναι μικρότερη από την κανονική",
  })
  .refine((t) => !t.day_night || t.price_per_kwh_night_eur != null, { message: "Συμπλήρωσε τη νυχτερινή τιμή" })
  .refine((t) => !t.valid_from || !t.valid_until || t.valid_until >= t.valid_from, { message: "Η λήξη είναι πριν από την έναρξη" });

/** Row for the `tariffs` table. Fields the form didn't send are left out, so an older form can't wipe them. */
export const clean = (t: z.infer<typeof TariffInput>, admin?: string) => {
  const { verified, ...rest } = t;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    ...rest,
    price_per_kwh_with_discount_eur: t.price_per_kwh_with_discount_eur ?? null,
    discount_condition: t.discount_condition || null,
    min_duration_months: t.min_duration_months ?? null,
    url: t.url || null,
    updated_at: now,
  };
  for (const k of ["promo_discount", "early_termination_fee", "conditions", "valid_from", "valid_until"] as const) {
    if (k in t) row[k] = t[k] || null;
  }
  if ("day_night" in t || "price_per_kwh_night_eur" in t) {
    row.day_night = !!t.day_night;
    row.price_per_kwh_night_eur = t.day_night ? t.price_per_kwh_night_eur ?? null : null;
  }
  if (verified === true) Object.assign(row, { data_status: "verified", last_verified_at: now });
  if (verified === false) row.data_status = "unverified";
  if (admin) row.updated_by = admin;
  return row;
};

/** The `category` column arrived with the gas upgrade; older databases don't have it yet. */
export const isMissingCategory = (msg?: string) => !!msg && /category/i.test(msg) && /column|schema cache/i.test(msg);

/**
 * Insert/update a tariff row, coping with a database that predates the gas upgrade: electricity rows are
 * written without `category`; gas rows report that the upgrade SQL is needed.
 */
export async function writeTariff<T>(row: Record<string, unknown>, run: (r: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  let current = { ...row };
  // Columns added by later migrations are dropped one by one until the database accepts the row.
  for (let i = 0; i < 20; i++) {
    const res = await run(current);
    const missing = res.error?.message.match(/Could not find the '([^']+)' column|column "?([a-z_]+)"? (?:of relation "?tariffs"? )?does not exist/i);
    const col = missing?.[1] ?? missing?.[2];
    if (!res.error || !col || !(col in current)) return res;
    if (col === "category" && current.category === "gas") return { data: null, error: { message: "missing_category" } };
    delete current[col];
  }
  return run(current);
}

export const TelecomInput = z
  .object({
    kind: z.enum(["internet", "mobile"]),
    provider: z.string().trim().min(1, "Γράψε πάροχο").max(100),
    name: z.string().trim().min(1, "Γράψε όνομα προγράμματος").max(200),
    monthly_eur: z.number().min(0).max(300, "Πάνω από 300 €/μήνα; Έλεγξε την τιμή"),
    promo_eur: z.number().min(0).max(300).nullable().optional(),
    promo_months: z.number().int().min(0).max(48).nullable().optional(),
    commitment_months: z.number().int().min(0).max(48).nullable().optional(),
    speed_mbps: z.number().int().min(1).max(10000).nullable().optional(),
    tech: z.string().trim().max(100).nullable().optional(),
    data_gb: z.number().min(0).max(10000).nullable().optional(),
    notes: z.string().trim().max(300).nullable().optional(),
    valid_month: z.string().regex(/^\d{4}-\d{2}$/, "Μήνας σε μορφή ΕΕΕΕ-ΜΜ"),
    url: z.union([z.literal(""), z.string().trim().url("Μη έγκυρο link").max(500)]).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((t) => (t.promo_eur == null) === (t.promo_months == null || t.promo_months === 0), {
    message: "Για προσφορά συμπλήρωσε και τιμή και μήνες προσφοράς",
  });

export const cleanTelecom = (t: z.infer<typeof TelecomInput>) => ({
  ...t,
  promo_eur: t.promo_eur ?? null,
  promo_months: t.promo_months || null,
  commitment_months: t.commitment_months ?? null,
  speed_mbps: t.kind === "internet" ? t.speed_mbps ?? null : null,
  tech: t.kind === "internet" ? t.tech || null : null,
  data_gb: t.kind === "mobile" ? t.data_gb ?? null : null,
  notes: t.notes || null,
  url: t.url || null,
  updated_at: new Date().toISOString(),
});

export const isMissingTable = (msg?: string, table = "") =>
  !!msg && (new RegExp(`relation .*${table}.* does not exist`, "i").test(msg) || /Could not find the table/i.test(msg));
