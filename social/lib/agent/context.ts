import type { SupabaseClient } from "@supabase/supabase-js";
import { INTEGRATIONS, integrationState } from "../integrations";

/**
 * Everything the agent needs to know about ONE business. Every query is filtered by businessId;
 * nothing from another tenant can end up in the prompt.
 */
export async function loadBusinessContext(db: SupabaseClient, businessId: string) {
  const [business, brand, memories, accounts, campaigns, upcoming, pendingApprovals] = await Promise.all([
    db.from("businesses").select("id,org_id,name,industry,description,website,language,timezone,autonomy_mode,autonomy_paused")
      .eq("id", businessId).single(),
    db.from("brand_profiles").select("*").eq("business_id", businessId).maybeSingle(),
    db.from("memories").select("id,kind,content,importance,created_at").eq("business_id", businessId).eq("archived", false)
      .order("importance", { ascending: false }).order("created_at", { ascending: false }).limit(40),
    db.from("social_accounts").select("platform,handle,status,scopes").eq("business_id", businessId),
    db.from("campaigns").select("id,name,objective,starts_on,ends_on,status").eq("business_id", businessId)
      .in("status", ["planned", "active"]).order("starts_on").limit(10),
    db.from("content_items").select("id,title,kind,platforms,status,planned_for,scheduled_for").eq("business_id", businessId)
      .gte("planned_for", new Date(Date.now() - 86_400_000).toISOString()).order("planned_for").limit(30),
    db.from("approvals").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "pending"),
  ]);
  if (business.error || !business.data) throw new Error(`business ${businessId} not found`);
  return {
    business: business.data,
    brand: brand.data,
    memories: memories.data ?? [],
    accounts: accounts.data ?? [],
    campaigns: campaigns.data ?? [],
    upcoming: upcoming.data ?? [],
    pendingApprovals: pendingApprovals.count ?? 0,
  };
}
export type BusinessContext = Awaited<ReturnType<typeof loadBusinessContext>>;

const list = (xs: unknown[] | null | undefined) => (xs && xs.length ? xs.join(", ") : "—");

/** Rendered once per run and placed in the (cached) system prompt. No timestamps here. */
export function renderContext(c: BusinessContext): string {
  const b = c.business;
  const brand = c.brand ?? {};
  const connected = c.accounts.filter((a) => a.status === "connected");
  const capability = INTEGRATIONS.map((i) => `- ${i.name}: ${integrationState(i)}`).join("\n");

  return `# BUSINESS: ${b.name}
Κλάδος: ${b.industry ?? "—"} | Website: ${b.website ?? "—"} | Γλώσσα περιεχομένου: ${b.language} | Ζώνη ώρας: ${b.timezone}
Περιγραφή: ${b.description ?? "— (δεν έχει συμπληρωθεί)"}
Autonomy mode: ${b.autonomy_mode}${b.autonomy_paused ? " — ΣΕ ΠΑΥΣΗ (emergency stop)" : ""}

## Brand identity
Φωνή: ${brand.voice ?? "—"}
Τόνος: ${brand.tone ?? "—"}
Κοινό: ${brand.target_audience ?? "—"}
Στόχοι marketing: ${brand.objectives ?? "—"}
Χρώματα: ${JSON.stringify(brand.colors ?? [])}
Fonts: ${JSON.stringify(brand.fonts ?? [])}
Κάνε: ${list(brand.do_list)}
Μην κάνεις: ${list(brand.dont_list)}
Brand hashtags: ${list(brand.hashtags)}
Οδηγίες: ${brand.guidelines ?? "—"}

## Μνήμη (σημαντικότερα πρώτα)
${c.memories.length ? c.memories.map((m) => `- [${m.kind}, ${m.importance}/5] ${m.content}`).join("\n") : "— (κενή)"}

## Συνδεδεμένοι λογαριασμοί social
${connected.length ? connected.map((a) => `- ${a.platform}: @${a.handle ?? "?"}`).join("\n") : "— ΚΑΝΕΝΑΣ. Δεν μπορείς να δημοσιεύσεις ούτε να διαβάσεις analytics/σχόλια από πλατφόρμες."}

## Ενεργές καμπάνιες
${c.campaigns.length ? c.campaigns.map((x) => `- ${x.name} (${x.starts_on ?? "?"} → ${x.ends_on ?? "?"}, ${x.status}) id=${x.id}`).join("\n") : "—"}

## Επερχόμενο περιεχόμενο (calendar)
${c.upcoming.length ? c.upcoming.map((x) => `- ${x.planned_for?.slice(0, 16) ?? "χωρίς ημ/νία"} | ${x.kind} | ${x.title} | ${list(x.platforms)} | ${x.status} | id=${x.id}`).join("\n") : "—"}

Εκκρεμείς εγκρίσεις: ${c.pendingApprovals}

## Κατάσταση συστήματος (τι λειτουργεί πραγματικά)
${capability}`;
}
