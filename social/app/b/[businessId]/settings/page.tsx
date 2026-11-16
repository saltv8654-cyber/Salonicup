import { requireBusinessAccess } from "@/lib/access";
import { userClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/policy";
import { PageHeader, Badge, fmtDate } from "@/app/ui";
import { saveBrand, setAutonomy, setPaused, setSchedule } from "./actions";

const WF = {
  daily_check: { label: "Καθημερινός έλεγχος", about: "Calendar επόμενων ημερών, κενά, εκκρεμότητες. (Συλλογή στατιστικών/σχολίων από Phase 4/6.)" },
  weekly_strategy: { label: "Εβδομαδιαία στρατηγική", about: "Ανασκόπηση, έρευνα, content plan επόμενης εβδομάδας ως drafts." },
  monthly_report: { label: "Μηνιαία αναφορά", about: "Σύνοψη μήνα, στρατηγική και καμπάνια επόμενου μήνα." },
} as const;
const DAYS = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

export default async function Settings({ params, searchParams }: { params: { businessId: string }; searchParams: { welcome?: string } }) {
  const { business, role } = await requireBusinessAccess(params.businessId);
  const db = userClient();
  const [{ data: brand }, { data: schedules }] = await Promise.all([
    db.from("brand_profiles").select("*").eq("business_id", business.id).single(),
    db.from("workflow_schedules").select("*").eq("business_id", business.id).order("workflow"),
  ]);
  const id = business.id;
  const editor = hasRole(role, "editor"), admin = hasRole(role, "admin");
  const b = brand ?? {};
  const field = (name: string, label: string, value: string | null | undefined, rows = 2, hint?: string) => (
    <div><label className="label" htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={rows} className="input" defaultValue={value ?? ""} disabled={!editor} />
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}</div>
  );

  return (
    <>
      <PageHeader title="Business Settings" subtitle="Ό,τι γράφεις εδώ μπαίνει στη μόνιμη μνήμη του agent για αυτή την επιχείρηση." />
      {searchParams.welcome && <div className="card mb-6 border-indigo-300 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10">
        Καλώς ήρθες. Συμπλήρωσε το brand profile — ή γράψε στο chat «Αυτή είναι η επιχείρησή μας: …» και ο agent θα το συμπληρώσει.</div>}

      <section className="card mb-6 border-rose-200 dark:border-rose-500/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Emergency stop</h2>
            <p className="muted">Σταματά αμέσως κάθε αυτόνομη εργασία και ακυρώνει όσες είναι σε ουρά. Στο chat, κάθε εξωτερική ενέργεια περνά από έγκριση.</p>
            {business.autonomy_paused && <p className="mt-1 text-sm text-rose-600">Σε παύση: {business.paused_reason}</p>}
          </div>
          {business.autonomy_paused
            ? <form action={setPaused.bind(null, id, false)}><button className="btn-primary" disabled={!admin}>▶ Επανεκκίνηση</button></form>
            : <form action={setPaused.bind(null, id, true)} className="flex gap-2">
                <input name="reason" className="input" placeholder="Λόγος (προαιρετικό)" />
                <button className="btn-danger" disabled={!editor}>⏸ Διακοπή</button></form>}
        </div>
      </section>

      <section className="card mb-6">
        <h2 className="font-semibold">Επίπεδο αυτονομίας</h2>
        <form action={setAutonomy.bind(null, id)} className="mt-3 grid gap-3 sm:grid-cols-3">
          {([
            ["manual", "Manual Approval", "Κάθε προγραμματισμός/δημοσίευση/απάντηση περιμένει έγκριση."],
            ["semi", "Semi-Autonomous", "Προγραμματίζει και απαντά σε απλά σχόλια· η δημοσίευση μη εγκεκριμένου περιεχομένου θέλει έγκριση."],
            ["full", "Fully Autonomous", "Εκτελεί μόνος του. Ευαίσθητες απαντήσεις, διαγραφές και αλλαγές brand θέλουν πάντα έγκριση."],
          ] as const).map(([v, label, about]) => (
            <label key={v} className={`cursor-pointer rounded-xl border p-3 ${business.autonomy_mode === v ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200 dark:border-slate-700"}`}>
              <input type="radio" name="mode" value={v} defaultChecked={business.autonomy_mode === v} className="mr-2" disabled={!admin} />
              <span className="font-medium">{label}</span><p className="muted mt-1">{about}</p>
            </label>
          ))}
          <div className="sm:col-span-3"><button className="btn-primary" disabled={!admin}>Αποθήκευση</button>
            {!admin && <span className="muted ml-3">Μόνο admin/owner.</span>}</div>
        </form>
      </section>

      <section className="card mb-6">
        <h2 className="mb-1 font-semibold">Αυτόματες εργασίες</h2>
        <p className="muted mb-3">Εκτελούνται από τον background worker ακόμη κι όταν δεν είσαι συνδεδεμένος (ώρα: {business.timezone}).</p>
        <div className="space-y-3">
          {(schedules ?? []).map((s) => (
            <form key={s.id} action={setSchedule.bind(null, id)} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input type="hidden" name="workflow" value={s.workflow} />
              <div className="min-w-[200px] flex-1">
                <p className="font-medium">{WF[s.workflow as keyof typeof WF].label} {s.enabled ? <Badge tone="green">ενεργό</Badge> : <Badge>ανενεργό</Badge>}</p>
                <p className="muted text-xs">{WF[s.workflow as keyof typeof WF].about}</p>
                {s.enabled && <p className="muted text-xs">Επόμενη: {fmtDate(s.next_run_at, business.timezone)}</p>}
              </div>
              {s.workflow === "weekly_strategy" && <select name="weekday" defaultValue={s.weekday ?? 1} className="input w-auto">{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>}
              {s.workflow === "monthly_report" && <input name="monthday" type="number" min={1} max={28} defaultValue={s.monthday ?? 1} className="input w-20" />}
              <select name="hour" defaultValue={s.hour_local} className="input w-auto">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={s.enabled} disabled={!editor} /> Ενεργό</label>
              <button className="btn-ghost" disabled={!editor}>Αποθήκευση</button>
            </form>
          ))}
        </div>
      </section>

      <form action={saveBrand.bind(null, id)} className="card space-y-4">
        <h2 className="font-semibold">Brand identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="industry">Κλάδος</label><input id="industry" name="industry" className="input" defaultValue={business.industry ?? ""} disabled={!admin} /></div>
          <div><label className="label" htmlFor="website">Website</label><input id="website" name="website" className="input" defaultValue={business.website ?? ""} disabled={!admin} /></div>
        </div>
        {field("description", "Περιγραφή επιχείρησης", business.description, 3)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("voice", "Φωνή", b.voice)}
          {field("tone", "Τόνος", b.tone)}
          {field("target_audience", "Κοινό-στόχος", b.target_audience, 3)}
          {field("objectives", "Στόχοι marketing", b.objectives, 3)}
          {field("do_list", "Κάνε (ένα ανά γραμμή)", (b.do_list ?? []).join("\n"), 4)}
          {field("dont_list", "Μην κάνεις (ένα ανά γραμμή)", (b.dont_list ?? []).join("\n"), 4)}
          {field("colors", "Χρώματα", (b.colors ?? []).map((c: { name: string; hex: string }) => `${c.name ? c.name + ": " : ""}${c.hex}`).join("\n"), 3, "π.χ. Κύριο: #0b3d91 — ένα ανά γραμμή")}
          {field("fonts", "Fonts", (b.fonts ?? []).map((f: { role: string; family: string }) => `${f.role}: ${f.family}`).join("\n"), 3, "π.χ. Τίτλοι: Montserrat")}
        </div>
        {field("hashtags", "Brand hashtags (ένα ανά γραμμή)", (b.hashtags ?? []).join("\n"), 3)}
        {field("guidelines", "Brand guidelines", b.guidelines, 5)}
        <button className="btn-primary" disabled={!editor}>Αποθήκευση brand</button>
      </form>
    </>
  );
}
