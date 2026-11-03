import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export const dbConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Server-only client with the service role key; RLS has no policies, so nothing else can touch the tables. */
export function db(): SupabaseClient {
  if (!dbConfigured()) throw new Error("Supabase is not configured");
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Next.js caches fetch() GETs by default; CRM reads must always hit the database.
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }
  return client;
}

export const LEAD_STATUSES = ["new", "contacted", "offer", "signed", "active", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  phone: string;
  email: string | null;
  preferred_time: string | null;
  message: string | null;
  consent_contact: boolean;
  consent_marketing: boolean;
  status: LeadStatus;
  tariff_id: string | null;
  tariff_label: string | null;
  current_provider: string | null;
  current_program: string | null;
  annual_kwh: number | null;
  current_annual: number | null;
  offer_annual: number | null;
  savings: number | null;
  bill: unknown;
  source: Record<string, string> | null;
  session_id: string | null;
  signed_provider: string | null;
  expected_commission: number | null;
  next_follow_up: string | null;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  created_at: string;
  type: "note" | "call" | "email" | "status" | "system";
  body: string;
}
