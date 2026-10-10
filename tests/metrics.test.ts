import { describe, expect, it } from "vitest";
import type { CallRow } from "@/lib/hubspot";
import { computeMetrics } from "@/lib/metrics";
import { sampleCalls } from "@/lib/sample-data";

const now = new Date("2026-10-10T12:00:00Z"); // Sat 10 Oct, 5:30 pm IST
const row = (over: Partial<CallRow>): CallRow => ({
  id: Math.random().toString(36),
  at: "2026-10-10T06:00:00Z",
  title: "Priya · new lead · booked",
  fromNumber: "+919800000001",
  durationSec: 240,
  callType: "new_lead",
  outcome: "booked",
  declineReason: "none",
  afterHours: false,
  ...over,
});

describe("dashboard metrics", () => {
  const rows = [
    row({}),
    row({ afterHours: true }),
    row({ outcome: "declined", declineReason: "outside_service_area" }),
    row({ outcome: "deferred", declineReason: "timeline_under_6_weeks" }),
    row({ outcome: "no_booking" }),
    row({ callType: "complaint", outcome: "escalated" }),
    row({ callType: "dropped", outcome: "no_booking", at: "2026-10-09T06:00:00Z" }),
    row({ at: "2026-08-01T06:00:00Z" }), // outside range
  ];
  const m = computeMetrics(rows, now, 7);

  it("counts calls, bookings and rates", () => {
    expect(m.calls).toBe(7);
    expect(m.booked).toBe(2);
    expect(m.qualifiedLeads).toBe(3); // booked x2 + no_booking; declined/deferred excluded
    expect(m.bookingRate).toBeCloseTo(2 / 3);
    expect(m.afterHours).toBe(1);
    expect(m.complaints).toBe(1);
  });

  it("groups decline reasons", () => {
    expect(m.declines.map((d) => [d.label, d.count])).toEqual([
      ["Outside Pune / PCMC", 1],
      ["Timeline under 6 weeks", 1],
    ]);
  });

  it("builds one bar per IST day", () => {
    expect(m.daily).toHaveLength(7);
    expect(m.daily.at(-1)).toMatchObject({ date: "2026-10-10", calls: 6, booked: 2 });
    expect(m.daily.at(-2)).toMatchObject({ date: "2026-10-09", calls: 1 });
  });

  it("never exposes email-confirmation counts or AI cost", () => {
    expect(JSON.stringify(Object.keys(m))).not.toMatch(/email|cost/i);
  });

  it("sample data is plausible", () => {
    const s = computeMetrics(sampleCalls(now), now, 30);
    expect(s.calls).toBeGreaterThan(100);
    expect(s.bookingRate).toBeGreaterThan(0.5);
    expect(s.afterHoursShare).toBeGreaterThan(0.2);
    expect(s.afterHoursShare).toBeLessThan(0.5);
  });
});
