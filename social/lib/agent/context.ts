import type { SupabaseClient } from "@supabase/supabase-js";
import { INTEGRATIONS, integrationState } from "../integrations";
import { snapshot } from "../salonicup";

export async function loadSettings(db: SupabaseClient) {
  const { data, error } = await db.from("social_settings").select("*").single();
  if (error || !data) throw new Error(`social_settings: ${error?.message ?? "missing — run the migration"}`);
  return data;
}

/** Everything the agent should know at the start of a run. */
export async function loadContext(db: SupabaseClient) {
  const [settings, memories, accounts, campaigns, upcoming, pending, league] = await Promise.all([
    loadSettings(db),
    db.from("social_memories").select("kind,content,importance").eq("archived", false)
      .order("importance", { ascending: false }).order("created_at", { ascending: false }).limit(40),
    db.from("social_accounts").select("platform,handle,status"),
    db.from("social_campaigns").select("id,name,starts_on,ends_on,status").in("status", ["planned", "active"]).order("starts_on").limit(10),
    db.from("social_content").select("id,title,kind,platforms,status,planned_for")
      .gte("planned_for", new Date(Date.now() - 86_400_000).toISOString()).order("planned_for").limit(30),
    db.from("social_approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    snapshot(db),
  ]);
  return {
    settings,
    memories: memories.data ?? [],
    accounts: accounts.data ?? [],
    campaigns: campaigns.data ?? [],
    upcoming: upcoming.data ?? [],
    pendingApprovals: pending.count ?? 0,
    league,
  };
}
export type AgentContext = Awaited<ReturnType<typeof loadContext>>;

const list = (xs: unknown[] | null | undefined) => (xs && xs.length ? xs.join(", ") : "—");

/** Rendered once per run and placed in the (cached) system prompt. No timestamps here. */
export function renderContext(c: AgentContext): string {
  const s = c.settings;
  const connected = c.accounts.filter((a) => a.status === "connected");
  return `# ${s.brand_name}
${s.description ?? ""}
Website: ${s.website ?? "—"} | Γλώσσα περιεχομένου: ${s.language} | Ζώνη ώρας: ${s.timezone}
Autonomy mode: ${s.autonomy_mode}${s.paused ? " — ΣΕ ΠΑΥΣΗ (emergency stop)" : ""}

## Brand identity
Φωνή: ${s.voice ?? "—"}
Τόνος: ${s.tone ?? "—"}
Κοινό: ${s.target_audience ?? "—"}
Στόχοι: ${s.objectives ?? "—"}
Χρώματα: ${JSON.stringify(s.colors ?? [])}
Fonts: ${JSON.stringify(s.fonts ?? [])}
Κάνε: ${list(s.do_list)}
Μην κάνεις: ${list(s.dont_list)}
Hashtags: ${list(s.hashtags)}
Οδηγίες: ${s.guidelines ?? "—"}

## Πρωτάθλημα (ζωντανά δεδομένα — λεπτομέρειες με get_league_data)
${c.league}

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
${INTEGRATIONS.map((i) => `- ${i.name}: ${integrationState(i)}`).join("\n")}`;
}
