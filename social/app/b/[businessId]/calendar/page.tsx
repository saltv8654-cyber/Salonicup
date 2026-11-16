import Link from "next/link";
import { requireBusinessAccess } from "@/lib/access";
import { userClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge, Badge, fmtDate } from "@/app/ui";

type Item = {
  id: string; kind: string; title: string; brief: string | null; caption: string | null; hashtags: string[]; cta: string | null;
  platforms: string[]; variants: Record<string, { caption?: string; hashtags?: string[]; format?: string; notes?: string }>;
  status: string; planned_for: string | null; scheduled_for: string | null; created_by: string;
};

function ItemCard({ c, tz }: { c: Item; tz: string }) {
  return (
    <details className="group rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
        <span className="font-medium">{c.title}</span>
        <Badge>{c.kind}</Badge>
        {c.platforms.map((p) => <Badge key={p} tone="indigo">{p}</Badge>)}
        <span className="ml-auto"><StatusBadge status={c.status} /></span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {c.scheduled_for && <p className="muted">Δημοσίευση: {fmtDate(c.scheduled_for, tz)}</p>}
        {c.brief && <div><p className="label">Creative brief</p><p className="whitespace-pre-wrap">{c.brief}</p></div>}
        {c.caption && <div><p className="label">Caption</p><p className="whitespace-pre-wrap">{c.caption}</p>
          {c.hashtags.length > 0 && <p className="mt-1 text-indigo-600 dark:text-indigo-300">{c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>}</div>}
        {c.cta && <p><span className="label inline">CTA </span>{c.cta}</p>}
        {Object.entries(c.variants ?? {}).map(([p, v]) => (
          <div key={p} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="label">{p}{v.format ? ` · ${v.format}` : ""}</p>
            <p className="whitespace-pre-wrap">{v.caption}</p>
            {v.notes && <p className="muted mt-1">{v.notes}</p>}
          </div>
        ))}
        <p className="muted text-xs">Δημιουργήθηκε από: {c.created_by === "agent" ? "AI agent" : "χρήστη"}</p>
      </div>
    </details>
  );
}

export default async function Calendar({ params, searchParams }: { params: { businessId: string }; searchParams: { w?: string } }) {
  const { business } = await requireBusinessAccess(params.businessId);
  const tz = business.timezone;
  const week = Number(searchParams.w ?? 0) || 0;
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() + week * 7 - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const db = userClient();
  const fields = "id,kind,title,brief,caption,hashtags,cta,platforms,variants,status,planned_for,scheduled_for,created_by";
  const [{ data: planned }, { data: unplanned }] = await Promise.all([
    db.from("content_items").select(fields).eq("business_id", business.id)
      .gte("planned_for", start.toISOString()).lt("planned_for", end.toISOString()).neq("status", "archived").order("planned_for"),
    db.from("content_items").select(fields).eq("business_id", business.id).is("planned_for", null)
      .in("status", ["idea", "draft"]).order("created_at", { ascending: false }).limit(30),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const base = `/b/${business.id}/calendar`;

  return (
    <>
      <PageHeader title="Content Calendar"
        subtitle={`${fmtDate(start.toISOString(), tz).split(",")[0]} – ${fmtDate(new Date(end.getTime() - 1).toISOString(), tz).split(",")[0]}`}
        actions={<div className="flex gap-2">
          <Link className="btn-ghost" href={`${base}?w=${week - 1}`}>←</Link>
          <Link className="btn-ghost" href={base}>Σήμερα</Link>
          <Link className="btn-ghost" href={`${base}?w=${week + 1}`}>→</Link>
        </div>} />
      <div className="space-y-4">
        {days.map((d) => {
          const items = ((planned ?? []) as Item[]).filter((c) => c.planned_for && dayKey(new Date(c.planned_for)) === dayKey(d));
          return (
            <section key={d.toISOString()} className="card">
              <h2 className="mb-2 text-sm font-semibold">{new Intl.DateTimeFormat("el-GR", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d)}</h2>
              {items.length ? <div className="space-y-2">{items.map((c) => <ItemCard key={c.id} c={c} tz={tz} />)}</div> : <p className="muted">—</p>}
            </section>
          );
        })}
        {!!unplanned?.length && (
          <section className="card">
            <h2 className="mb-2 text-sm font-semibold">Drafts χωρίς ημερομηνία</h2>
            <div className="space-y-2">{(unplanned as Item[]).map((c) => <ItemCard key={c.id} c={c} tz={tz} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}
