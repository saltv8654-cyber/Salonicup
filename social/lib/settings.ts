import { userClient, supabaseConfigured } from "./supabase/server";

export interface Settings {
  brand_name: string; description: string | null; website: string | null; language: string; timezone: string;
  autonomy_mode: "manual" | "semi" | "full"; paused: boolean; paused_reason: string | null; monthly_ai_budget_usd: number;
  voice: string | null; tone: string | null; target_audience: string | null; objectives: string | null;
  colors: { name: string; hex: string }[]; fonts: { role: string; family: string }[];
  do_list: string[]; dont_list: string[]; hashtags: string[]; guidelines: string | null;
}

/** Settings as seen by the signed-in admin (RLS). Null if the migration has not been run. */
export async function getSettings(): Promise<Settings | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await userClient().from("social_settings").select("*").maybeSingle();
  return data as Settings | null;
}
