import { userClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { PageHeader, Badge, fmtDate } from "@/app/ui";
import { saveBrand, setAutonomy, setPaused, setSchedule } from "./actions";
import { RunNow } from "./run-now";

const WF = {
  weekly_program: { label: "Πρόγραμμα εβδομάδας (Πέμπτη)", about: "Ένα post ανά πρωτάθλημα με το σχέδιο «Εβδομάδα» της καρτέλας Posts (τετράγωνο + story) και λεζάντα με όλους τους αγώνες. Χωρίς AI, χωρίς κόστος. Πρωταθλήματα χωρίς αγώνες παραλείπονται." },
  daily_check: { label: "Καθημερινός έλεγχος", about: "Νέα αποτελέσματα → Final Score drafts, επόμενοι αγώνες → Matchday drafts, κενά στο calendar, εκκρεμότητες." },
  weekly_strategy: { label: "Εβδομαδιαία στρατηγική", about: "Ανασκόπηση, ιστορίες της αγωνιστικής (ντέρμπι, σερί, σκόρερ), content plan επόμενης εβδομάδας." },
  monthly_report: { label: "Μηνιαία αναφορά", about: "Σύνοψη μήνα (πρωτάθλημα + social), στρατηγική και καμπάνια επόμενου μήνα." },
} as const;
const DAYS = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

export default async function SettingsPage() {
  const s = (await getSettings())!;
  const { data: rows } = await userClient().from("social_schedules").select("*").order("workflow");
  // The Thursday programme first: it is the main job.
  const schedules = [...(rows ?? [])].sort((a, b) => (a.workflow === "weekly_program" ? -1 : b.workflow === "weekly_program" ? 1 : 0));
  const field = (name: string, label: string, value: string | null | undefined, rows = 2, hint?: string) => (
    <div><label className="label" htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={rows} className="input" defaultValue={value ?? ""} />
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}</div>
  );

  return (
    <>
      <PageHeader title="Ρυθμίσεις" subtitle="Ό,τι γράφεις εδώ είναι μόνιμη γνώση του agent. Μπορείς και να του το πεις στο chat." />

      <section className="card mb-6 border-rose-200 dark:border-rose-500/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Emergency stop</h2>
            <p className="muted">Σταματά αμέσως κάθε αυτόνομη εργασία και ακυρώνει όσες είναι σε ουρά. Στο chat, κάθε εξωτερική ενέργεια περνά από έγκριση.</p>
            {s.paused && <p className="mt-1 text-sm text-rose-600">Σε παύση: {s.paused_reason}</p>}
          </div>
          {s.paused
            ? <form action={setPaused.bind(null, false)}><button className="btn-primary">▶ Επανεκκίνηση</button></form>
            : <form action={setPaused.bind(null, true)} className="flex gap-2">
                <input name="reason" className="input" placeholder="Λόγος (προαιρετικό)" />
                <button className="btn-danger">⏸ Διακοπή</button></form>}
        </div>
      </section>

      <section className="card mb-6">
        <h2 className="font-semibold">Επίπεδο αυτονομίας</h2>
        <form action={setAutonomy} className="mt-3 grid gap-3 sm:grid-cols-3">
          {([
            ["manual", "Manual Approval", "Κάθε προγραμματισμός/δημοσίευση/απάντηση περιμένει έγκριση."],
            ["semi", "Semi-Autonomous", "Προγραμματίζει και απαντά σε απλά σχόλια· η δημοσίευση μη εγκεκριμένου περιεχομένου θέλει έγκριση."],
            ["full", "Fully Autonomous", "Εκτελεί μόνος του. Ευαίσθητες απαντήσεις, διαγραφές και αλλαγές brand θέλουν πάντα έγκριση."],
          ] as const).map(([v, label, about]) => (
            <label key={v} className={`cursor-pointer rounded-xl border p-3 ${s.autonomy_mode === v ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200 dark:border-slate-700"}`}>
              <input type="radio" name="mode" value={v} defaultChecked={s.autonomy_mode === v} className="mr-2" />
              <span className="font-medium">{label}</span><p className="muted mt-1">{about}</p>
            </label>
          ))}
          <div className="sm:col-span-3"><button className="btn-primary">Αποθήκευση</button></div>
        </form>
      </section>

      <section className="card mb-6">
        <h2 className="mb-1 font-semibold">Αυτόματες εργασίες</h2>
        <p className="muted mb-3">Εκτελούνται από τον background worker ακόμη κι όταν δεν είσαι συνδεδεμένος (ώρα: {s.timezone}).</p>
        <div className="space-y-3">
          {schedules.map((w) => (
            <div key={w.workflow} className="space-y-2">
            <form key={w.workflow} action={setSchedule} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input type="hidden" name="workflow" value={w.workflow} />
              <div className="min-w-[200px] flex-1">
                <p className="font-medium">{WF[w.workflow as keyof typeof WF].label} {w.enabled ? <Badge tone="green">ενεργό</Badge> : <Badge>ανενεργό</Badge>}</p>
                <p className="muted text-xs">{WF[w.workflow as keyof typeof WF].about}</p>
                {w.enabled && <p className="muted text-xs">Επόμενη: {fmtDate(w.next_run_at, s.timezone)}</p>}
              </div>
              {w.workflow === "weekly_program" && (
                <>
                  <select name="week" defaultValue={w.options?.week ?? "next"} className="input w-auto">
                    <option value="next">Εβδομάδα που ξεκινά την επόμενη Δευτέρα</option>
                    <option value="current">Τρέχουσα εβδομάδα</option>
                  </select>
                  {["instagram", "facebook"].map((p) => (
                    <label key={p} className="flex items-center gap-1 text-sm"><input type="checkbox" name={`p_${p}`} defaultChecked={(w.options?.platforms ?? ["instagram", "facebook"]).includes(p)} /> {p}</label>
                  ))}
                </>
              )}
              {(w.workflow === "weekly_strategy" || w.workflow === "weekly_program") && <select name="weekday" defaultValue={w.weekday ?? 1} className="input w-auto">{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>}
              {w.workflow === "monthly_report" && <input name="monthday" type="number" min={1} max={28} defaultValue={w.monthday ?? 1} className="input w-20" />}
              <select name="hour" defaultValue={w.hour_local} className="input w-auto">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={w.enabled} /> Ενεργό</label>
              <button className="btn-ghost">Αποθήκευση</button>
            </form>
            {w.workflow === "weekly_program" && <RunNow />}
            </div>
          ))}
        </div>
      </section>

      <form action={saveBrand} className="card space-y-4">
        <h2 className="font-semibold">Brand identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="website">Website</label><input id="website" name="website" className="input" defaultValue={s.website ?? ""} /></div>
          <div><label className="label" htmlFor="budget">Μηνιαίο όριο κόστους AI (USD)</label>
            <input id="budget" name="monthly_ai_budget_usd" type="number" min={0} step={1} className="input" defaultValue={s.monthly_ai_budget_usd} />
            <p className="muted mt-1 text-xs">Όταν το φτάσει, ο agent σταματά μέχρι την αρχή του επόμενου μήνα.</p></div>
        </div>
        {field("description", "Περιγραφή", s.description, 3)}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("voice", "Φωνή", s.voice)}
          {field("tone", "Τόνος", s.tone)}
          {field("target_audience", "Κοινό-στόχος", s.target_audience, 3)}
          {field("objectives", "Στόχοι", s.objectives, 3, "π.χ. περισσότερες ομάδες, θεατές στα livestreams, ορατότητα χορηγών")}
          {field("do_list", "Κάνε (ένα ανά γραμμή)", s.do_list.join("\n"), 4)}
          {field("dont_list", "Μην κάνεις (ένα ανά γραμμή)", s.dont_list.join("\n"), 4)}
          {field("colors", "Χρώματα", s.colors.map((c) => `${c.name ? c.name + ": " : ""}${c.hex}`).join("\n"), 3, "π.χ. Κύριο: #0b3d91 — ένα ανά γραμμή")}
          {field("fonts", "Fonts", s.fonts.map((f) => `${f.role}: ${f.family}`).join("\n"), 3, "π.χ. Τίτλοι: Montserrat")}
        </div>
        {field("hashtags", "Hashtags (ένα ανά γραμμή)", s.hashtags.join("\n"), 3)}
        {field("guidelines", "Οδηγίες", s.guidelines, 5)}
        <button className="btn-primary">Αποθήκευση</button>
      </form>
    </>
  );
}
