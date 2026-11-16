import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { userClient } from "@/lib/supabase/server";
import { PageHeader, Badge, Empty, fmtDate } from "@/app/ui";

const KIND_LABEL: Record<string, string> = { fact: "Γεγονός", preference: "Προτίμηση", learning: "Μάθημα", strategy: "Στρατηγική",
  campaign: "Καμπάνια", audience: "Κοινό", performance: "Απόδοση" };

export default async function Strategy() {
  const tz = (await getSettings())!.timezone;
  const db = userClient();
  const [{ data: campaigns }, { data: memories }] = await Promise.all([
    db.from("social_campaigns").select("*").order("starts_on", { ascending: false }).limit(20),
    db.from("social_memories").select("*").eq("archived", false).order("importance", { ascending: false }).order("created_at", { ascending: false }).limit(100),
  ]);
  return (
    <>
      <PageHeader title="Marketing Strategy" subtitle="Καμπάνιες και η μόνιμη μνήμη του agent."
        actions={<Link className="btn-primary" href={"/chat"}>Ζήτα νέα στρατηγική</Link>} />
      <h2 className="mb-3 font-semibold">Καμπάνιες</h2>
      {campaigns?.length ? (
        <div className="mb-8 space-y-3">{campaigns.map((c) => (
          <details key={c.id} className="card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
              <span className="font-medium">{c.name}</span><Badge tone="indigo">{c.status}</Badge>
              <span className="muted ml-auto text-xs">{c.starts_on} → {c.ends_on}</span>
            </summary>
            {c.objective && <p className="mt-3 text-sm"><span className="label inline">Στόχος </span>{c.objective}</p>}
            {c.strategy && <p className="mt-2 whitespace-pre-wrap text-sm">{c.strategy}</p>}
          </details>
        ))}</div>
      ) : <div className="mb-8"><Empty title="Καμία καμπάνια ακόμα" /></div>}

      <h2 className="mb-3 font-semibold">Μνήμη ({memories?.length ?? 0})</h2>
      {memories?.length ? (
        <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">{memories.map((m) => (
          <li key={m.id} className="px-5 py-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2"><Badge>{KIND_LABEL[m.kind] ?? m.kind}</Badge>
              <span className="text-xs text-amber-500">{"★".repeat(m.importance)}</span>
              <span className="muted text-xs">{m.source} · {fmtDate(m.created_at, tz)}</span></div>
            <p>{m.content}</p>
          </li>
        ))}</ul>
      ) : <Empty title="Η μνήμη είναι κενή" />}
    </>
  );
}
