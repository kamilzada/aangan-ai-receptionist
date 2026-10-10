/**
 * Clearly-labelled sample calls so the dashboard can be demoed before HubSpot holds real calls.
 * Proportions follow the September transcripts (≈55% booked, a third after hours, a few declines, rare complaints).
 * Shown only when HubSpot isn't configured or DASHBOARD_SAMPLE_DATA=true.
 */
import type { CallRow } from "./hubspot";

const NAMES = ["Priya", "Rohit", "Anjali", "Suresh", "Meera", "Kunal", "Sneha", "Vikram", "Neha", "Amit", "Pooja", "Sanjay", "Ritu", "Arjun", "Kavita", "Nikita"];

/** mulberry32: small, deterministic, good enough spread for demo data. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleCalls(now: Date, days = 90): CallRow[] {
  const rand = rng(20261010);
  const rows: CallRow[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const n = Math.round(4 + rand() * 5 + (d < 30 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const afterHours = rand() < 0.34;
      const hour = afterHours ? (rand() < 0.6 ? 19 + Math.floor(rand() * 4) : 7 + Math.floor(rand() * 3)) : 10 + Math.floor(rand() * 9);
      const at = new Date(now.getTime() - d * 86_400_000);
      at.setUTCHours(hour - 5, Math.floor(rand() * 60) - 30, 0, 0);
      if (at > now) continue;
      const roll = rand();
      let callType = "new_lead";
      let outcome = "booked";
      let declineReason = "none";
      if (roll < 0.05) [callType, outcome] = ["complaint", "escalated"];
      else if (roll < 0.11) [callType, outcome] = ["dropped", "no_booking"];
      else if (roll < 0.14) [callType, outcome] = ["other", "no_booking"];
      else if (roll < 0.36) {
        outcome = "declined";
        declineReason = pick(rand, ["outside_service_area", "outside_service_area", "advice_only", "out_of_scope_type", "budget_clearly_too_low", "too_small"]);
      } else if (roll < 0.41) [outcome, declineReason] = ["deferred", "timeline_under_6_weeks"];
      else if (roll < 0.53) outcome = "no_booking";
      else if (roll < 0.57) callType = "repeat_caller";
      const durationSec = callType === "dropped" ? 20 + Math.floor(rand() * 40) : 150 + Math.floor(rand() * 300);
      const name = pick(rand, NAMES);
      rows.push({
        id: `sample-${d}-${i}`,
        at: at.toISOString(),
        title: `${name} · ${callType.replace(/_/g, " ")} · ${outcome.replace(/_/g, " ")}`,
        fromNumber: `+9198${String(Math.floor(rand() * 1e8)).padStart(8, "0")}`,
        durationSec,
        callType,
        outcome,
        declineReason,
        afterHours,
      });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

function pick<T>(rand: () => number, xs: T[]): T {
  return xs[Math.floor(rand() * xs.length)];
}
