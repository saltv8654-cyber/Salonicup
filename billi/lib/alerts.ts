import { analyseProfile, normaliseProfile, type EnergyProfile, type UserSettings } from "./account";
import { db } from "./db";
import { normKey } from "./energy/model";
import { restricted } from "./compare";
import { escapeHtml, mailConfigured, sendMail, siteUrl } from "./mailer";
import { loadTariffs } from "./tariffs";

/**
 * Price alerts. They run on the comparison engine, which only uses verified, valid tariffs, so no alert
 * ever rests on unverified prices. One alert per event (dedupe_key); e-mail only to verified addresses.
 */
type Kind = "cheaper_program" | "provider_increase" | "provider_better_offer" | "contract_expiring" | "overpaying";
interface Draft { kind: Kind; title: string; body: string; data: Record<string, unknown>; dedupe_key: string }

const eur = (x: number) => `${Math.round(x).toLocaleString("el-GR")} €`;
const price = (x: number) => `${x.toFixed(4).replace(".", ",")} €/kWh`;

async function draftsFor(p: EnergyProfile, s: UserSettings, tariffs: Awaited<ReturnType<typeof loadTariffs>>["tariffs"]): Promise<Draft[]> {
  const out: Draft[] = [];
  const threshold = Math.max(1, s.min_savings_eur);

  // 4. Contract ending soon (needs no prices).
  if (p.contract_end) {
    const days = Math.ceil((Date.parse(`${p.contract_end}T00:00:00Z`) - Date.now()) / 86_400_000);
    if (days >= 0 && days <= s.contract_reminder_days) {
      out.push({
        kind: "contract_expiring", dedupe_key: `contract:${p.contract_end}`,
        title: `Η σύμβασή σου λήγει σε ${days} ημέρες`,
        body: `Η σύμβαση${p.provider ? ` με ${p.provider}` : ""} λήγει στις ${p.contract_end.split("-").reverse().join("/")}. Σύγκρινε τώρα, πριν ανανεωθεί με νέους όρους.`,
        data: { contract_end: p.contract_end, days },
      });
    }
  }

  const a = await analyseProfile(p, tariffs);
  const c = a.comparison;
  if (!c || c.currentAnnual === null) return out;
  const pool = c.offers.filter((o) => !o.expired && o.tariff.color !== "orange" && !restricted(o.tariff));
  const cost = (o: (typeof pool)[number]) => o.annualWithDiscount ?? o.annual;
  const current = a.currentTariff;

  // 1. A cheaper programme is available.
  const best = pool.find((o) => o.tariff.id !== current?.id);
  if (best && c.currentAnnual - cost(best) >= threshold) {
    const t = best.tariff;
    out.push({
      kind: "cheaper_program", dedupe_key: `cheaper:${t.id}:${Math.round((t.price_per_kwh_with_discount_eur ?? t.price_per_kwh_eur) * 1e5)}:${t.fixed_monthly_eur}`,
      title: `Φθηνότερο πρόγραμμα: ~${eur(c.currentAnnual - cost(best))}/έτος λιγότερα`,
      body: `Το ${t.provider} ${t.name} κοστίζει ~${eur(cost(best))}/έτος για την κατανάλωσή σου, έναντι ~${eur(c.currentAnnual)} σήμερα. Εκτίμηση με επιβεβαιωμένες τιμές, όχι εγγυημένη εξοικονόμηση.`,
      data: { tariff_id: t.id, savings: c.currentAnnual - cost(best) },
    });
  }

  // 3. A better offer from the current provider.
  if (p.provider) {
    const same = pool.find((o) => normKey(o.tariff.provider) === normKey(p.provider!) && o.tariff.id !== current?.id);
    if (same && c.currentAnnual - cost(same) >= threshold) {
      out.push({
        kind: "provider_better_offer", dedupe_key: `same:${same.tariff.id}:${Math.round(same.tariff.price_per_kwh_eur * 1e5)}`,
        title: `Καλύτερη προσφορά από ${same.tariff.provider}`,
        body: `Χωρίς αλλαγή παρόχου: το ${same.tariff.name} βγαίνει ~${eur(c.currentAnnual - cost(same))}/έτος φθηνότερα από ό,τι πληρώνεις.`,
        data: { tariff_id: same.tariff.id },
      });
    }
  }

  // 5. Today's plan is clearly above comparable alternatives (20%+ over the cheapest): once a month.
  if (pool.length && c.currentAnnual > cost(pool[0]) * 1.2) {
    out.push({
      kind: "overpaying", dedupe_key: `overpay:${new Date().toISOString().slice(0, 7)}`,
      title: "Πληρώνεις αισθητά περισσότερα από τις εναλλακτικές",
      body: `Το κόστος σου είναι ${Math.round((c.currentAnnual / cost(pool[0]) - 1) * 100)}% πάνω από το φθηνότερο επιβεβαιωμένο πρόγραμμα.`,
      data: { ratio: c.currentAnnual / cost(pool[0]) },
    });
  }

  // 2. The current provider raised the price of the user's programme (approved changes only).
  if (current) {
    const { data } = await db()
      .from("tariff_price_history")
      .select("id, changed_at, change, price_per_kwh_eur")
      .eq("tariff_id", current.id)
      .order("changed_at", { ascending: false })
      .limit(2);
    const [last, prev] = (data ?? []) as { id: number; changed_at: string; change: string; price_per_kwh_eur: string | number | null }[];
    if (last && prev && last.change === "updated" && last.price_per_kwh_eur !== null && prev.price_per_kwh_eur !== null
        && Number(last.price_per_kwh_eur) > Number(prev.price_per_kwh_eur) && last.changed_at >= p.created_at) {
      out.push({
        kind: "provider_increase", dedupe_key: `increase:${current.id}:${last.id}`,
        title: `Αύξηση τιμής στο ${current.name}`,
        body: `${current.provider}: από ${price(Number(prev.price_per_kwh_eur))} σε ${price(Number(last.price_per_kwh_eur))}.`,
        data: { tariff_id: current.id, from: Number(prev.price_per_kwh_eur), to: Number(last.price_per_kwh_eur) },
      });
    }
  }
  return out;
}

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await db().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

/** Check every electricity profile (or one user's) and store new alerts. Returns how many were created. */
export async function runAlerts(onlyUser?: string): Promise<{ users: number; created: number; emailed: number }> {
  let q = db().from("energy_profiles").select("*").eq("category", "electricity").limit(5000);
  if (onlyUser) q = q.eq("user_id", onlyUser);
  const { data: profiles, error } = await q;
  if (error) throw new Error(error.message);
  if (!profiles?.length) return { users: 0, created: 0, emailed: 0 };
  const { tariffs } = await loadTariffs("electricity");
  const ids = profiles.map((p) => p.user_id as string);
  const { data: settingsRows } = await db().from("user_profiles").select("*").in("user_id", ids);
  const byUser = new Map(((settingsRows ?? []) as UserSettings[]).map((s) => [s.user_id, s]));
  let created = 0;
  let emailed = 0;

  for (const raw of profiles) {
    const p = normaliseProfile(raw);
    const s = byUser.get(p.user_id) ?? ({ user_id: p.user_id, inapp_alerts: true, email_alerts: false, email_verified_at: null, min_savings_eur: 30, contract_reminder_days: 30 } as UserSettings);
    if (!s.inapp_alerts && !s.email_alerts) continue;
    try {
      const drafts = await draftsFor(p, { ...s, min_savings_eur: Number(s.min_savings_eur) }, tariffs);
      for (const d of drafts) {
        const { data: row, error: e } = await db()
          .from("user_alerts")
          .upsert({ user_id: p.user_id, ...d }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
          .select("id");
        if (e || !row?.length) continue; // already sent before
        created++;
        if (s.email_alerts && s.email_verified_at && mailConfigured()) {
          const to = await emailOf(p.user_id);
          const link = `${siteUrl()}/account`;
          if (to && (await sendMail(to, `Billi: ${d.title}`, `${d.body}\n\nΔες λεπτομέρειες: ${link}\n\nΑλλαγή ρυθμίσεων ειδοποιήσεων: ${link}#settings`,
            `<p>${escapeHtml(d.body)}</p><p><a href="${link}">Δες λεπτομέρειες στο Billi</a></p><p style="color:#888;font-size:12px">Αλλαγή ρυθμίσεων ειδοποιήσεων: <a href="${link}#settings">${link}</a></p>`))) {
            await db().from("user_alerts").update({ emailed_at: new Date().toISOString() }).eq("id", (row[0] as { id: string }).id);
            emailed++;
          }
        }
      }
      await db().from("user_profiles").update({ alerts_checked_at: new Date().toISOString() }).eq("user_id", p.user_id);
    } catch (e) {
      console.error("runAlerts:", p.user_id, e);
    }
  }
  return { users: profiles.length, created, emailed };
}
