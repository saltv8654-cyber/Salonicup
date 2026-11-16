import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/access";
import { SECTIONS } from "@/lib/nav";
import { PageHeader, Badge } from "@/app/ui";

/** Sections whose backend is not built yet: say what they will do and what is missing. No placeholder data. */
export default async function Section({ params }: { params: { businessId: string; section: string } }) {
  const s = SECTIONS.find((x) => x.slug === params.section && !x.active);
  if (!s) notFound();
  await requireBusinessAccess(params.businessId);
  return (
    <>
      <PageHeader title={s.label} />
      <div className="card max-w-2xl">
        <Badge tone="amber">Phase {s.phase} — δεν είναι ακόμα ενεργό</Badge>
        <p className="mt-4">{s.about}</p>
        {s.needs && <p className="muted mt-3">{s.needs}</p>}
        <p className="muted mt-4">Μέχρι τότε, ο agent μπορεί ήδη να γράψει briefs, captions, scripts και πλάνα για αυτή την ενότητα μέσα από το chat.</p>
        <Link className="btn-primary mt-4" href={`/b/${params.businessId}/chat`}>Άνοιγμα chat</Link>
      </div>
    </>
  );
}
