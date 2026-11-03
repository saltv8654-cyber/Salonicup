import type { TelecomBill, TelecomPlan } from "./types";

/** Contracts are compared over 24 months so promos and price steps are counted fairly. */
export const HORIZON_MONTHS = 24;

export function avgMonthly(p: TelecomPlan): number {
  const promoMonths = Math.min(p.promo_months ?? 0, HORIZON_MONTHS);
  const promo = p.promo_eur ?? p.monthly_eur;
  return (promo * promoMonths + p.monthly_eur * (HORIZON_MONTHS - promoMonths)) / HORIZON_MONTHS;
}

export interface TelecomNeeds {
  /** internet: at least this speed */
  minSpeed: number | null;
  /** mobile: at least this much data per month; null = unlimited needed */
  minDataGb: number | null;
  needUnlimitedData: boolean;
}

export interface TelecomOffer {
  plan: TelecomPlan;
  avgMonthly: number;
  /** positive = cheaper per month than today */
  savingsMonthly: number | null;
  fits: boolean;
}

export interface TelecomSide {
  kind: "internet" | "mobile";
  current: number | null;
  offers: TelecomOffer[];
  best: TelecomOffer | null;
  reasons: string[];
}

export interface TelecomComparison {
  internet: TelecomSide | null;
  mobile: TelecomSide | null;
}

const fmt = (n: number) => `${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function fits(p: TelecomPlan, needs: TelecomNeeds): boolean {
  if (p.kind === "internet") return needs.minSpeed === null || (p.speed_mbps ?? 0) >= needs.minSpeed;
  if (needs.needUnlimitedData) return p.data_gb === undefined;
  return needs.minDataGb === null || p.data_gb === undefined || p.data_gb >= needs.minDataGb;
}

function side(kind: "internet" | "mobile", plans: TelecomPlan[], needs: TelecomNeeds, current: number | null): TelecomSide {
  const offers = plans
    .filter((p) => p.kind === kind)
    .map((p) => {
      const m = avgMonthly(p);
      return { plan: p, avgMonthly: m, savingsMonthly: current !== null ? current - m : null, fits: fits(p, needs) };
    })
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.avgMonthly - b.avgMonthly);
  const best = offers.find((o) => o.fits) ?? null;

  const reasons: string[] = [];
  if (best) {
    const need = kind === "internet"
      ? needs.minSpeed ? `τουλάχιστον ${needs.minSpeed} Mbps` : "οποιαδήποτε ταχύτητα"
      : needs.needUnlimitedData ? "απεριόριστα data" : needs.minDataGb ? `τουλάχιστον ${needs.minDataGb} GB` : "οποιαδήποτε data";
    reasons.push(`Για ${need}, το φθηνότερο είναι το ${best.plan.provider} ${best.plan.name}, με μέσο κόστος ${fmt(best.avgMonthly)}/μήνα στα 2 χρόνια.`);
    if (best.plan.promo_eur !== undefined && best.plan.promo_months) {
      reasons.push(`Κοστίζει ${fmt(best.plan.promo_eur)} τους πρώτους ${best.plan.promo_months} μήνες και μετά ${fmt(best.plan.monthly_eur)}.`);
    }
    if (best.plan.commitment_months) reasons.push(`Έχει δέσμευση ${best.plan.commitment_months} μηνών.`);
    if (current !== null) {
      const s = current - best.avgMonthly;
      reasons.push(
        s > 0.5
          ? `Θα γλίτωνες ~${fmt(s)}/μήνα, δηλαδή ~${Math.round(s * 12)} €/χρόνο.`
          : "Το τωρινό σου πρόγραμμα είναι ήδη από τα φθηνότερα για τις ανάγκες σου.",
      );
    }
  }
  return { kind, current, offers, best, reasons };
}

export function compareTelecom(
  plans: TelecomPlan[],
  opts: { internet?: { needs: TelecomNeeds; current: number | null } | null; mobile?: { needs: TelecomNeeds; current: number | null } | null },
): TelecomComparison {
  return {
    internet: opts.internet ? side("internet", plans, opts.internet.needs, opts.internet.current) : null,
    mobile: opts.mobile ? side("mobile", plans, opts.mobile.needs, opts.mobile.current) : null,
  };
}

/** Needs read off a bill: match today's speed / data so the advice is like-for-like. */
export function needsFromBill(b: TelecomBill) {
  return {
    internet: b.has_internet
      ? { needs: { minSpeed: b.internet_speed_mbps, minDataGb: null, needUnlimitedData: false }, current: b.internet_monthly_eur }
      : null,
    mobile: b.has_mobile
      ? {
          needs: { minSpeed: null, minDataGb: b.mobile_unlimited_data ? null : b.mobile_data_gb, needUnlimitedData: !!b.mobile_unlimited_data },
          current: b.mobile_monthly_eur !== null && b.mobile_lines ? b.mobile_monthly_eur / b.mobile_lines : b.mobile_monthly_eur,
        }
      : null,
  };
}
