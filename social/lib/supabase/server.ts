import { createServerClient } from "@supabase/ssr";
import { createClient as createRaw, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** User-scoped client: every query runs under the user's RLS policies. */
export function userClient(): SupabaseClient {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component: the middleware refreshes the cookies.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;
/**
 * Service-role client: bypasses RLS. Server only (agent, worker, approvals).
 * Use only after checking the caller is an admin (or from the cron-authenticated worker).
 */
export function serviceClient(): SupabaseClient {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  admin ??= createRaw(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return admin;
}

export const supabaseConfigured = () =>
  !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
