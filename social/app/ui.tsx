import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "slate", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = {
  idea: "slate", draft: "slate", pending_approval: "amber", approved: "indigo", scheduled: "indigo", publishing: "amber",
  published: "green", failed: "red", rejected: "red", archived: "slate",
  pending: "amber", succeeded: "green", running: "indigo", stopped: "amber", refused: "red",
  active: "green", needs_credentials: "amber", planned: "slate", unsupported: "red",
};
export const STATUS_LABEL: Record<string, string> = {
  idea: "Ιδέα", draft: "Draft", pending_approval: "Σε έγκριση", approved: "Εγκρίθηκε", scheduled: "Προγραμματισμένο",
  publishing: "Δημοσιεύεται", published: "Δημοσιεύτηκε", failed: "Απέτυχε", rejected: "Απορρίφθηκε", archived: "Αρχείο",
  pending: "Εκκρεμεί", succeeded: "Ολοκληρώθηκε", running: "Τρέχει", stopped: "Σταμάτησε", refused: "Απορρίφθηκε",
  active: "Ενεργό", needs_credentials: "Χρειάζεται credentials", planned: "Δεν έχει υλοποιηθεί", unsupported: "Δεν υποστηρίζεται",
};
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? "slate"}>{STATUS_LABEL[status] ?? status}</Badge>;

export function Empty({ title, children, href, cta }: { title: string; children?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card flex flex-col items-center py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="muted mt-1 max-w-md">{children}</div>}
      {href && cta && <Link href={href} className="btn-primary mt-4">{cta}</Link>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="muted mt-1">{hint}</p>}
    </div>
  );
}

export const fmtDate = (iso: string | null | undefined, tz = "Europe/Athens") =>
  iso ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso)) : "—";
