/** Dashboard numbers from HubSpot call rows. Pure; tested in tests/metrics.test.ts. */
import type { CallRow } from "./hubspot";
import { istDateKey, istParts } from "./slots";

export const DECLINE_LABELS: Record<string, string> = {
  outside_service_area: "Outside Pune / PCMC",
  advice_only: "Advice only",
  out_of_scope_type: "Out-of-scope type",
  timeline_under_6_weeks: "Timeline under 6 weeks",
  budget_clearly_too_low: "Budget too low",
  too_small: "Too small",
};

export type Metrics = {
  calls: number;
  afterHours: number;
  afterHoursShare: number;
  booked: number;
  qualifiedLeads: number;
  bookingRate: number; // booked / qualified leads
  complaints: number;
  declines: { reason: string; label: string; count: number }[];
  daily: { date: string; label: string; calls: number; booked: number }[];
  latest: CallRow[];
};

const LEAD_TYPES = new Set(["new_lead", "repeat_caller"]);

export function computeMetrics(all: CallRow[], now: Date, days: number): Metrics {
  const from = istDayStart(now, days - 1);
  const rows = all.filter((r) => new Date(r.at) >= from).sort((a, b) => b.at.localeCompare(a.at));

  const booked = rows.filter((r) => r.outcome === "booked").length;
  const leads = rows.filter((r) => LEAD_TYPES.has(r.callType));
  const qualified = leads.filter((r) => r.outcome !== "declined" && r.outcome !== "deferred").length;
  const afterHours = rows.filter((r) => r.afterHours).length;

  const declineCounts = new Map<string, number>();
  for (const r of rows) {
    if ((r.outcome === "declined" || r.outcome === "deferred") && r.declineReason && r.declineReason !== "none") {
      declineCounts.set(r.declineReason, (declineCounts.get(r.declineReason) ?? 0) + 1);
    }
  }

  const byDay = new Map<string, { calls: number; booked: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(istDateKey(istDayStart(now, i)), { calls: 0, booked: 0 });
  for (const r of rows) {
    const d = byDay.get(istDateKey(new Date(r.at)));
    if (!d) continue;
    d.calls++;
    if (r.outcome === "booked") d.booked++;
  }

  return {
    calls: rows.length,
    afterHours,
    afterHoursShare: rows.length ? afterHours / rows.length : 0,
    booked,
    qualifiedLeads: qualified,
    bookingRate: qualified ? booked / qualified : 0,
    complaints: rows.filter((r) => r.callType === "complaint").length,
    declines: [...declineCounts.entries()]
      .map(([reason, count]) => ({ reason, label: DECLINE_LABELS[reason] ?? reason.replace(/_/g, " "), count }))
      .sort((a, b) => b.count - a.count),
    daily: [...byDay.entries()].map(([date, v]) => ({ date, label: dayLabel(date), ...v })),
    latest: rows.slice(0, 12),
  };
}

/** Midnight IST, `daysAgo` days before `now`. */
function istDayStart(now: Date, daysAgo: number): Date {
  const p = istParts(now);
  return new Date(Date.UTC(p.year, p.month, p.day - daysAgo) - 330 * 60_000);
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
