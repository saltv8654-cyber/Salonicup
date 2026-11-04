import { db } from "../db";
import { notifyText } from "../notify";
import { extractTariffs, netOfVat, type ExtractedTariff, type Extraction } from "./extract";
import { fetchDocument, storeDocument, type FetchedDoc } from "./fetch-source";
import {
  DETAIL_FIELDS, PRICE_FIELDS, changedFields, normKey, rowToValues, sameValue,
  type ChangeType, type Flag, type Provider, type QueueItem, type Source, type TariffRowAny, type TariffValues,
} from "./model";
import { duplicateNames, priceAppearsIn, validateValues } from "./validate";
import { discover } from "./discover";

export const AUTO_ACTOR = "Billi (αυτόματος έλεγχος)";

export interface RunResult {
  source_id: string;
  label: string;
  status: "ok" | "unchanged" | "failed";
  message: string;
  found: number;
  queued: number;
  verified: number;
}

const ALL_FIELDS = [...PRICE_FIELDS, ...DETAIL_FIELDS] as const;

export function matchProvider(name: string, providers: Provider[]): Provider | null {
  const k = normKey(name);
  return providers.find((p) => normKey(p.name) === k || p.aliases.some((a) => normKey(a) === k)) ?? null;
}

const dedupeKey = (providerName: string, name: string, segment: string) => `${normKey(providerName)}|${normKey(name)}|${segment}`;

function toValues(t: ExtractedTariff, provider: string, pageUrl: string): TariffValues {
  const n = netOfVat(t);
  const s = (v: string | null) => (v && v.trim() ? v.trim().slice(0, 500) : null);
  return {
    provider,
    name: n.name.trim().slice(0, 200),
    color: n.color,
    segment: n.segment,
    fixed_monthly_eur: n.fixed_monthly_eur,
    price_per_kwh_eur: n.price_per_kwh_eur,
    day_night: n.day_night,
    price_per_kwh_night_eur: n.price_per_kwh_night_eur,
    price_per_kwh_with_discount_eur: n.price_per_kwh_with_discount_eur,
    discount_condition: s(n.discount_condition),
    promo_discount: s(n.promo_discount),
    min_duration_months: n.min_duration_months === null ? null : Math.round(n.min_duration_months),
    early_termination_fee: s(n.early_termination_fee),
    conditions: s(n.conditions),
    valid_from: s(n.valid_from),
    valid_until: s(n.valid_until),
    valid_month: s(n.valid_month),
    url: (n.found_in === "document" && n.document_url) || pageUrl,
  };
}

interface Proposal {
  key: string;
  provider: string;
  provider_id: string | null;
  program: string;
  tariff_id: string | null;
  change_type: ChangeType;
  old_values: TariffValues | null;
  new_values: TariffValues | null;
  changed_fields: string[];
  flags: Flag[];
  evidence: string | null;
  source_document: string | null;
}

/** Checks one source: fetch → extract → compare with what is published → queue the differences. */
export async function runSource(
  source: Source, trigger: "cron" | "manual", admin: string | null = null, preloaded?: FetchedDoc,
  /** results of an AI web search: no page to fetch, no copy kept, every programme flagged for checking */
  searched?: Extraction,
): Promise<RunResult> {
  const started = new Date().toISOString();
  const base = { source_id: source.id, label: source.label };
  const { data: log } = await db()
    .from("tariff_update_logs")
    .insert({ trigger, admin, source_id: source.id, provider_id: source.provider_id, status: "running", started_at: started })
    .select("id")
    .single();
  const runId = (log as { id: string } | null)?.id ?? null;

  const finish = async (r: Omit<RunResult, "source_id" | "label">, extra: Record<string, unknown> = {}) => {
    const now = new Date().toISOString();
    await db().from("tariff_update_logs").update({ ...r, finished_at: now, ...extra }).eq("id", runId);
    await db().from("tariff_data_sources").update({
      last_checked_at: now,
      last_status: r.status,
      last_error: r.status === "failed" ? r.message.slice(0, 500) : null,
      ...(r.status !== "failed" ? { last_success_at: now } : {}),
      ...(extra.document_hash ? { last_hash: extra.document_hash, last_document_path: extra.document_path ?? null } : {}),
      updated_at: now,
    }).eq("id", source.id);
    return { ...base, ...r };
  };

  try {
    const { data: provRows, error: pErr } = await db().from("energy_providers").select("*");
    if (pErr) throw new Error(pErr.message);
    const providers = (provRows ?? []) as Provider[];
    const owner = source.provider_id ? providers.find((p) => p.id === source.provider_id) ?? null : null;
    const folder = owner?.slug ?? "multi";

    // A whole site: find its price pages and add them as sources; their prices are read on their own runs.
    if (source.kind === "site") {
      const d = await discover(source, owner?.name ?? null);
      return await finish({ status: d.found ? "ok" : "failed", message: d.message, found: d.found, queued: 0, verified: 0 });
    }

    // An uploaded price list arrives already read; an AI search arrives already extracted; the rest is fetched.
    const doc: FetchedDoc = searched
      ? { url: source.url, type: "html", bytes: Buffer.alloc(0), text: null, pdfLinks: [], hash: "" }
      : preloaded ?? (await fetchDocument(source.url, source.kind as "auto" | "html" | "pdf"));
    const docPath = searched ? null : await storeDocument(doc, folder);
    const docMeta = searched ? {} : { document_hash: doc.hash, document_path: docPath };

    // Unchanged since the last good check: the published programmes of this source are confirmed again.
    if (!searched && source.last_hash === doc.hash && source.last_status !== "failed") {
      const verified = await reconfirm(source.id);
      return await finish({ status: "unchanged", message: "Η πηγή δεν άλλαξε από τον προηγούμενο έλεγχο", found: 0, queued: 0, verified }, docMeta);
    }

    const extra: FetchedDoc[] = [];
    const { extraction, documents } = searched ? { extraction: searched, documents: [] as FetchedDoc[] } : await extractTariffs(doc, {
      provider: owner?.name ?? null,
      fetchPdf: async (u) => {
        try {
          const d = await fetchDocument(u, "pdf");
          extra.push(d);
          return d;
        } catch {
          return null;
        }
      },
    });
    const storedDocs = await Promise.all(documents.map(async (d) => ({ url: d.url, path: await storeDocument(d, folder), type: d.type })));
    const docPathOf = (url: string) => storedDocs.find((d) => d.url === url)?.path ?? docPath;

    const wantedSegment = (s: string) => source.segment === "both" || s === source.segment;
    const extracted = extraction.tariffs.filter((t) => wantedSegment(t.segment) && t.name.trim());
    if (extracted.length === 0) {
      return await finish(
        { status: "failed", message: `Δεν βρέθηκαν τιμολόγια ρεύματος${extraction.notes ? `: ${extraction.notes}` : ""}`, found: 0, queued: 0, verified: 0 },
        { ...docMeta, documents: storedDocs },
      );
    }

    // Published electricity programmes of the providers involved.
    const { data: pubRows, error: tErr } = await db().from("tariffs").select("*").limit(5000);
    if (tErr) throw new Error(tErr.message);
    const published = ((pubRows ?? []) as TariffRowAny[]).filter((r) => (r.category ?? "electricity") === "electricity");

    const values = extracted.map((t) => {
      const prov = owner ?? matchProvider(t.provider, providers);
      return { t, prov, v: toValues(t, prov?.name ?? t.provider.trim(), doc.url) };
    });
    const dupes = duplicateNames(values.map((x) => x.v));

    const proposals: Proposal[] = [];
    const matchedIds = new Set<string>();
    const confirm: string[] = [];

    for (const { t, prov, v } of values) {
      const pubMatch = published.find(
        (r) =>
          (prov ? r.provider_id === prov.id || normKey(r.provider) === normKey(prov.name) : normKey(r.provider) === normKey(v.provider)) &&
          normKey(r.name) === normKey(v.name) &&
          ((r.segment as string) ?? "residential") === v.segment,
      );
      const old = pubMatch ? rowToValues(pubMatch) : null;
      if (pubMatch) matchedIds.add(pubMatch.id);

      const flags: Flag[] = []; // source checks; field validation is added per proposal below
      const key = dedupeKey(v.provider, v.name, v.segment);
      if (dupes.has(`${normKey(v.provider)}|${normKey(v.name)}|${v.segment}`)) flags.push({ code: "duplicate", level: "warning", message: "Το ίδιο πρόγραμμα βρέθηκε πάνω από μία φορά στην πηγή" });
      if (!prov) flags.push({ code: "unknown_provider", level: "warning", message: `Άγνωστος πάροχος «${v.provider}»: θα προστεθεί στη λίστα παρόχων με την έγκριση` });
      if (!t.evidence.trim()) flags.push({ code: "no_evidence", level: "warning", message: "Δεν δόθηκε απόσπασμα από την πηγή" });
      if (t.found_in === "page" && doc.text) {
        if (v.price_per_kwh_eur !== null && !priceAppearsIn(doc.text, t.price_per_kwh_eur ?? v.price_per_kwh_eur)) {
          flags.push({ code: "price_not_in_source", level: "warning", message: "Η τιμή €/kWh δεν βρέθηκε αυτούσια στο κείμενο της σελίδας" });
        }
        if (v.fixed_monthly_eur !== null && v.fixed_monthly_eur > 0 && !priceAppearsIn(doc.text, t.fixed_monthly_eur ?? v.fixed_monthly_eur)) {
          flags.push({ code: "fee_not_in_source", level: "warning", message: "Το πάγιο δεν βρέθηκε αυτούσιο στο κείμενο της σελίδας" });
        }
      }
      if (t.found_in === "document" && !t.document_url) flags.push({ code: "no_document", level: "warning", message: "Η τιμή είναι από PDF αλλά δεν δόθηκε το link του" });
      if (t.prices_include_vat) flags.push({ code: "vat_removed", level: "warning", message: "Οι τιμές της πηγής είχαν ΦΠΑ· αφαιρέθηκε 6%" });
      if (searched) flags.push({ code: "found_via_search", level: "warning", message: "Βρέθηκε με αναζήτηση AI στο web, όχι από ανάγνωση της σελίδας: άνοιξε το link και επιβεβαίωσε την τιμή." });

      const common = {
        key, provider: v.provider, provider_id: prov?.id ?? null, program: v.name,
        evidence: t.evidence.trim().slice(0, 1000) || null,
        source_document: t.found_in === "document" && t.document_url ? docPathOf(t.document_url) : docPath,
      };

      if (!old) {
        proposals.push({ ...common, flags: [...validateValues(v, null), ...flags], tariff_id: null, change_type: "new", old_values: null, new_values: v, changed_fields: [] });
        continue;
      }
      // Carry over what the source doesn't mention, so a silent page doesn't wipe a known condition.
      const merged: TariffValues = { ...v };
      for (const f of DETAIL_FIELDS) if (merged[f] === null && old[f] !== null) (merged as unknown as Record<string, unknown>)[f] = old[f];
      const priceDiff = changedFields(old, merged, PRICE_FIELDS);
      const detailDiff = changedFields(old, merged, DETAIL_FIELDS);
      if (priceDiff.length === 0 && detailDiff.length === 0) {
        const evidenceOk = !searched && !flags.some((f) => f.code === "price_not_in_source" || f.code === "fee_not_in_source");
        if (evidenceOk) confirm.push(pubMatch!.id);
        continue;
      }
      proposals.push({
        ...common,
        flags: [...validateValues(merged, old), ...flags],
        tariff_id: pubMatch!.id,
        change_type: priceDiff.length ? "price_change" : "details_change",
        old_values: old,
        new_values: merged,
        changed_fields: [...priceDiff, ...detailDiff],
      });
    }

    // Programmes this source used to list and no longer does.
    for (const r of published) {
      if (searched || r.source_id !== source.id || !r.active || matchedIds.has(r.id)) continue;
      if (!wantedSegment(((r.segment as string) ?? "residential"))) continue;
      const old = rowToValues(r);
      proposals.push({
        key: dedupeKey(old.provider, old.name, old.segment), provider: old.provider, provider_id: (r.provider_id as string) ?? null,
        program: old.name, tariff_id: r.id, change_type: "discontinued", old_values: old, new_values: null, changed_fields: ["active"],
        flags: [],
        evidence: null, source_document: docPath,
      });
    }

    const queued = await enqueue(proposals, source, runId);
    let verified = 0;
    if (confirm.length) {
      const now = new Date().toISOString();
      const { data } = await db()
        .from("tariffs")
        .update({ last_verified_at: now, data_status: "verified", ...(preloaded ? {} : { source_id: source.id }), updated_at: now })
        .in("id", confirm)
        .select("id");
      verified = (data ?? []).length;
    }

    const msg = queued
      ? `${queued} αλλαγές περιμένουν έγκριση`
      : `Καμία αλλαγή${verified ? `· ${verified} προγράμματα επιβεβαιώθηκαν` : ""}`;
    return await finish({ status: "ok", message: msg, found: extracted.length, queued, verified }, { ...docMeta, documents: storedDocs });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return await finish({ status: "failed", message, found: 0, queued: 0, verified: 0 });
  }
}

/** Source content identical to last time: refresh the verification date of the programmes read from it. */
async function reconfirm(sourceId: string): Promise<number> {
  const now = new Date().toISOString();
  const { data } = await db()
    .from("tariffs")
    .update({ last_verified_at: now, updated_at: now })
    .eq("source_id", sourceId)
    .eq("data_status", "verified")
    .eq("active", true)
    .select("id");
  return (data ?? []).length;
}

const sameValues = (a: TariffValues | null, b: TariffValues | null) =>
  a === b || (!!a && !!b && ([...ALL_FIELDS, "name", "provider", "valid_month", "url"] as (keyof TariffValues)[]).every((f) => sameValue(a[f], b[f])));

/** Writes proposals to the queue: one pending item per programme, refreshed in place; known rejections are not re-queued. */
async function enqueue(proposals: Proposal[], source: Source, runId: string | null): Promise<number> {
  const keys = proposals.map((p) => p.key);
  const { data: existing } = await db()
    .from("tariff_update_queue")
    .select("*")
    .in("status", ["pending", "rejected"])
    .order("created_at", { ascending: false })
    .limit(2000);
  const rows = (existing ?? []) as QueueItem[];
  const now = new Date().toISOString();
  let queued = 0;

  for (const p of proposals) {
    const pending = rows.find((r) => r.status === "pending" && r.dedupe_key === p.key);
    const rejectedSame = rows.some((r) => r.status === "rejected" && r.dedupe_key === p.key && r.change_type === p.change_type && sameValues(r.new_values, p.new_values));
    if (rejectedSame) continue;
    const body = {
      run_id: runId, source_id: source.id, provider_id: p.provider_id, provider: p.provider, program: p.program,
      tariff_id: p.tariff_id, change_type: p.change_type, old_values: p.old_values, new_values: p.new_values,
      changed_fields: p.changed_fields, flags: p.flags, source_url: p.new_values?.url ?? source.url,
      source_document: p.source_document, evidence: p.evidence, updated_at: now,
    };
    if (pending) {
      if (pending.change_type === p.change_type && sameValues(pending.new_values, p.new_values)) continue;
      // An administrator may have edited the pending values: keep their notes, replace the proposal.
      await db().from("tariff_update_queue").update(body).eq("id", pending.id);
      queued++;
      continue;
    }
    const { error } = await db().from("tariff_update_queue").insert({ ...body, dedupe_key: p.key, status: "pending" });
    if (!error) queued++;
    else console.error("enqueue:", error.message);
  }

  // Pending items from this source that the source no longer supports.
  const stale = rows.filter((r) => r.status === "pending" && r.source_id === source.id && !keys.includes(r.dedupe_key));
  if (stale.length) {
    await db()
      .from("tariff_update_queue")
      .update({ status: "superseded", updated_at: now, notes: "Η πηγή δεν δείχνει πια αυτή την αλλαγή" })
      .in("id", stale.map((r) => r.id));
  }
  return queued;
}

const isDue = (s: Source, now: number) => !s.last_checked_at || now - Date.parse(s.last_checked_at) >= s.check_every_hours * 3_600_000 - 5 * 60_000;

/** Scheduled run: every enabled source that is due, oldest first, within a time budget. */
export async function runDueSources(budgetMs = 240_000, trigger: "cron" | "manual" = "cron"): Promise<{ results: RunResult[]; remaining: number }> {
  const t0 = Date.now();
  const { data, error } = await db().from("tariff_data_sources").select("*").eq("enabled", true).limit(500);
  if (error) throw new Error(error.message);
  const byAge = (a: Source, b: Source) => (a.last_checked_at ?? "").localeCompare(b.last_checked_at ?? "");
  let due = ((data ?? []) as Source[]).filter((s) => isDue(s, t0)).sort(byAge);
  const results: RunResult[] = [];
  // Whole sites first: the pages they find are read in the same run.
  const sites = due.filter((s) => s.kind === "site");
  for (const s of sites) {
    if (Date.now() - t0 > budgetMs) break;
    results.push(await runSource(s, trigger));
  }
  if (sites.length) {
    const { data: again } = await db().from("tariff_data_sources").select("*").eq("enabled", true).limit(500);
    due = ((again ?? []) as Source[]).filter((s) => s.kind !== "site" && isDue(s, Date.now())).sort(byAge);
  }
  for (const s of due.filter((x) => x.kind !== "site")) {
    if (Date.now() - t0 > budgetMs) break;
    results.push(await runSource(s, trigger));
  }
  const queued = results.reduce((n, r) => n + r.queued, 0);
  const failed = results.filter((r) => r.status === "failed");
  if (queued || failed.length) {
    const lines = ["⚡ Billi · έλεγχος τιμολογίων"];
    if (queued) lines.push(`🟡 ${queued} αλλαγές περιμένουν έγκριση στο CRM → Ενέργεια`);
    for (const f of failed) lines.push(`🔴 ${f.label}: ${f.message}`);
    await notifyText(lines.join("\n"));
  }
  return { results, remaining: Math.max(0, sites.length + due.length - results.length) };
}
