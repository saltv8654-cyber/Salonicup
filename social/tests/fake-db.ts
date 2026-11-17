// In-memory stand-in for the Supabase query builder: records every call, applies eq() filters.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Rec = Record<string, any>;
export function fakeDb(seed: Record<string, Rec[]>) {
  const tables: Record<string, Rec[]> = structuredClone(seed);
  const log: { table: string; op: string; filters: [string, unknown][]; values?: unknown }[] = [];
  const uploads: { bucket: string; path: string; bytes: number; contentType?: string }[] = [];
  const db = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Uint8Array, opts?: { contentType?: string }) => {
          uploads.push({ bucket, path, bytes: body.length, contentType: opts?.contentType });
          return { data: { path }, error: null };
        },
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })), error: null }),
      }),
    },
    from(table: string) {
      tables[table] ??= [];
      const entry = { table, op: "select", filters: [] as [string, unknown][], preds: [] as ((r: Rec) => boolean)[], values: undefined as unknown };
      log.push(entry);
      const match = (r: Rec) => entry.filters.every(([k, v]) => r[k] === v) && entry.preds.every((p) => p(r));
      const result = () => {
        if (entry.op === "insert") {
          const rows = (Array.isArray(entry.values) ? entry.values : [entry.values]).map((v: any, i: number) => ({ id: `new-${table}-${tables[table].length + i}`, ...v }));
          tables[table].push(...rows);
          return rows;
        }
        const rows = tables[table].filter(match);
        if (entry.op === "update") rows.forEach((r) => Object.assign(r, entry.values));
        return rows;
      };
      const q: any = {
        select: () => q,
        insert: (v: unknown) => { entry.op = "insert"; entry.values = v; return q; },
        update: (v: unknown) => { entry.op = "update"; entry.values = v; return q; },
        eq: (k: string, v: unknown) => { entry.filters.push([k, v]); return q; },
        in: (k: string, vs: unknown[]) => { entry.preds.push((r) => vs.includes(r[k])); return q; },
        gt: (k: string, v: any) => { entry.preds.push((r) => r[k] > v); return q; },
        gte: (k: string, v: any) => { entry.preds.push((r) => r[k] >= v); return q; },
        lte: (k: string, v: any) => { entry.preds.push((r) => r[k] <= v); return q; },
        lt: (k: string, v: any) => { entry.preds.push((r) => r[k] < v); return q; }, is: () => q, or: () => q, order: () => q, limit: () => q,
        single: async () => { const r = result(); return r.length ? { data: r[0], error: null } : { data: null, error: { message: "0 rows" } }; },
        maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
        then: (res: (v: unknown) => void) => res({ data: result(), error: null }),
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, tables, log, uploads };
}
