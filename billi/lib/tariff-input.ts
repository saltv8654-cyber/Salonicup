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
  })
  .refine((t) => t.price_per_kwh_with_discount_eur == null || t.price_per_kwh_with_discount_eur <= t.price_per_kwh_eur, {
    message: "Η τιμή με έκπτωση πρέπει να είναι μικρότερη από την κανονική",
  });

export const clean = (t: z.infer<typeof TariffInput>) => ({
  ...t,
  price_per_kwh_with_discount_eur: t.price_per_kwh_with_discount_eur ?? null,
  discount_condition: t.discount_condition || null,
  min_duration_months: t.min_duration_months ?? null,
  url: t.url || null,
  updated_at: new Date().toISOString(),
});
