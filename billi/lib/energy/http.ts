import { NextRequest, NextResponse } from "next/server";
import { adminName } from "../admin-auth";
import { dbConfigured } from "../db";
import { ReviewError } from "./publish";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** The new tables are missing until the migration has been run in Supabase. */
export const isMissingMigration = (msg?: string) => !!msg && (/relation .* does not exist|Could not find the table/i.test(msg));

/** The "whole site" source type needs supabase/migrations/20261106_site_sources.sql. */
export const isSiteMigrationMissing = (msg?: string) => !!msg && /tariff_data_sources_kind_check|discovered_from/.test(msg);

type Handler = (req: NextRequest, admin: string, ctx: { params: Record<string, string> }) => Promise<NextResponse>;

/** Admin-only route with the same error shape everywhere: 401, 409 missing_migration, 4xx/5xx { error }. */
export function adminRoute(handler: Handler) {
  return async (req: NextRequest, ctx: { params: Record<string, string> }) => {
    const admin = adminName(req);
    if (!admin) return json({ error: "unauthorized" }, 401);
    if (!dbConfigured()) return json({ error: "Δεν έχει συνδεθεί το Supabase" }, 500);
    try {
      return await handler(req, admin, ctx ?? { params: {} });
    } catch (e) {
      if (e instanceof ReviewError) return json({ error: e.message }, e.status);
      const msg = e instanceof Error ? e.message : String(e);
      if (isMissingMigration(msg)) return json({ error: "missing_migration" }, 409);
      console.error(e);
      return json({ error: msg }, 500);
    }
  };
}

/** Throws the PostgREST error so adminRoute can turn it into a response. */
export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
