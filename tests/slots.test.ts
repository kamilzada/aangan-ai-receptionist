import { describe, expect, it } from "vitest";
import { parseBookingHours } from "@/lib/config";
import { rotate } from "@/lib/roundrobin";
import {
  candidateStarts,
  decodeSlotId,
  encodeSlotId,
  istInstant,
  istParts,
  isFree,
  matchesPreference,
  pickSlots,
  spoken,
} from "@/lib/slots";

const hours = parseBookingHours("Mon-Sat 10:00-18:00");
// Saturday 10 Oct 2026, 11:00 IST
const now = istInstant(2026, 9, 10, 11 * 60);

describe("booking hours", () => {
  it("parses day ranges and times", () => {
    expect([...hours.weekdays].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hours.startMinutes).toBe(600);
    expect(hours.endMinutes).toBe(1080);
  });
  it("rejects malformed input", () => {
    expect(() => parseBookingHours("weekdays 9-5")).toThrow();
  });
});

describe("candidate starts", () => {
  const c = candidateStarts({ now, hours, meetingMinutes: 30, minLeadMinutes: 120, daysAhead: 7 });
  it("respects the 2-hour lead time", () => {
    expect(spoken(c[0])).toBe("Saturday 10 October at 1 pm");
  });
  it("skips Sundays and stays inside hours", () => {
    for (const s of c) {
      const p = istParts(s);
      expect(p.weekday).not.toBe(0);
      expect(p.minutesOfDay).toBeGreaterThanOrEqual(600);
      expect(p.minutesOfDay + 30).toBeLessThanOrEqual(1080);
    }
  });
});

describe("preferences", () => {
  const tue4 = istInstant(2026, 9, 13, 16 * 60);
  it("matches weekday and time of day", () => {
    expect(matchesPreference(tue4, now, "tuesday", "evening")).toBe(true);
    expect(matchesPreference(tue4, now, "Tue", "morning")).toBe(false);
    expect(matchesPreference(tue4, now, "2026-10-13")).toBe(true);
    expect(matchesPreference(tue4, now, "tomorrow")).toBe(false);
  });
});

describe("spoken time", () => {
  it("reads naturally", () => {
    expect(spoken(istInstant(2026, 9, 13, 16 * 60 + 30))).toBe("Tuesday 13 October at 4:30 pm");
    expect(spoken(istInstant(2026, 9, 13, 12 * 60))).toBe("Tuesday 13 October at 12 pm");
  });
});

describe("slot ids", () => {
  it("round-trips", () => {
    const s = istInstant(2026, 9, 13, 600);
    const d = decodeSlotId(encodeSlotId("ananya", s));
    expect(d?.designerCode).toBe("ananya");
    expect(d?.start.getTime()).toBe(s.getTime());
    expect(decodeSlotId("garbage")).toBeNull();
  });
});

describe("free/busy and picking", () => {
  const designers = [{ code: "a" }, { code: "b" }];
  const candidates = candidateStarts({ now, hours, meetingMinutes: 30, minLeadMinutes: 120, daysAhead: 7 });
  const allWeek = [{ start: now, end: new Date(now.getTime() + 8 * 86_400_000) }];

  it("detects overlap", () => {
    const slot = { start: istInstant(2026, 9, 13, 600), end: istInstant(2026, 9, 13, 630) };
    expect(isFree(slot, [{ start: istInstant(2026, 9, 13, 615), end: istInstant(2026, 9, 13, 700) }])).toBe(false);
    expect(isFree(slot, [{ start: istInstant(2026, 9, 13, 630), end: istInstant(2026, 9, 13, 700) }])).toBe(true);
  });

  it("skips a fully booked designer and offers one designer's slots", () => {
    const r = pickSlots({ designersInOrder: designers, busyByCode: { a: allWeek, b: [] }, candidates, meetingMinutes: 30, now, max: 3 });
    expect(r?.designer.code).toBe("b");
    expect(r?.starts).toHaveLength(3);
  });

  it("falls back when the preference can't be met", () => {
    const r = pickSlots({ designersInOrder: designers, busyByCode: { a: [], b: [] }, candidates, meetingMinutes: 30, now, preferredDay: "sunday", max: 3 });
    expect(r?.matchedPreference).toBe(false);
  });

  it("returns null when nobody is free", () => {
    expect(pickSlots({ designersInOrder: designers, busyByCode: { a: allWeek, b: allWeek }, candidates, meetingMinutes: 30, now, max: 3 })).toBeNull();
  });

  it("rotates after the last booked designer", () => {
    expect(rotate([{ code: "a" }, { code: "b" }, { code: "c" }], "a").map((d) => d.code)).toEqual(["b", "c", "a"]);
    expect(rotate([{ code: "a" }, { code: "b" }], null).map((d) => d.code)).toEqual(["a", "b"]);
  });
});
