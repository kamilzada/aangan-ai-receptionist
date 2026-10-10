/** Pure slot logic: no network. Everything here is unit-tested in tests/slots.test.ts. */
import type { BookingHours } from "./config";

export const IST_OFFSET_MIN = 330;

export type Interval = { start: Date; end: Date };
export type TimeOfDay = "morning" | "afternoon" | "evening";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Calendar parts of a UTC instant as seen in IST. */
export function istParts(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth(), // 0-based
    day: t.getUTCDate(),
    weekday: t.getUTCDay(),
    minutesOfDay: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

/** The UTC instant for an IST wall-clock date + minutes after midnight. */
export function istInstant(year: number, month: number, day: number, minutesOfDay: number): Date {
  return new Date(Date.UTC(year, month, day, 0, minutesOfDay) - IST_OFFSET_MIN * 60_000);
}

export function istDateKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Every meeting start inside booking hours over the next `daysAhead` days, at least `minLeadMinutes` from now. */
export function candidateStarts(opts: {
  now: Date;
  hours: BookingHours;
  meetingMinutes: number;
  minLeadMinutes: number;
  daysAhead: number;
}): Date[] {
  const { now, hours, meetingMinutes, minLeadMinutes, daysAhead } = opts;
  const earliest = now.getTime() + minLeadMinutes * 60_000;
  const today = istParts(now);
  const out: Date[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const dayStart = istInstant(today.year, today.month, today.day + i, 0);
    const p = istParts(dayStart);
    if (!hours.weekdays.has(p.weekday)) continue;
    for (let m = hours.startMinutes; m + meetingMinutes <= hours.endMinutes; m += meetingMinutes) {
      const start = istInstant(p.year, p.month, p.day, m);
      if (start.getTime() >= earliest) out.push(start);
    }
  }
  return out;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isFree(slot: Interval, busy: Interval[]): boolean {
  return !busy.some((b) => overlaps(slot, b));
}

/**
 * Narrows candidates to what the caller asked for. Unknown or empty preferences pass everything through.
 * preferredDay: "today" | "tomorrow" | a weekday name | "YYYY-MM-DD".
 */
export function matchesPreference(
  start: Date,
  now: Date,
  preferredDay?: string,
  preferredTime?: TimeOfDay,
): boolean {
  const p = istParts(start);
  if (preferredTime === "morning" && p.minutesOfDay >= 12 * 60) return false;
  if (preferredTime === "afternoon" && (p.minutesOfDay < 12 * 60 || p.minutesOfDay >= 16 * 60)) return false;
  if (preferredTime === "evening" && p.minutesOfDay < 16 * 60) return false;

  const day = preferredDay?.trim().toLowerCase();
  if (!day) return true;
  const key = istDateKey(start);
  if (day === "today") return key === istDateKey(now);
  if (day === "tomorrow") return key === istDateKey(new Date(now.getTime() + 86_400_000));
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return key === day;
  const wd = WEEKDAYS.findIndex((w) => w.toLowerCase().startsWith(day.slice(0, 3)));
  if (wd >= 0) return p.weekday === wd;
  return true;
}

/** "Tuesday 14 October at 4 pm" / "at 4:30 pm". */
export function spoken(start: Date): string {
  const p = istParts(start);
  const h24 = Math.floor(p.minutesOfDay / 60);
  const min = p.minutesOfDay % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "am" : "pm";
  const time = min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]} at ${time}`;
}

/** Stateless slot id: the designer code and start instant, base64url-encoded. */
export function encodeSlotId(designerCode: string, start: Date): string {
  return Buffer.from(JSON.stringify({ d: designerCode, s: start.toISOString() })).toString("base64url");
}

export function decodeSlotId(id: string): { designerCode: string; start: Date } | null {
  try {
    const v = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
    const start = new Date(v.s);
    if (typeof v.d !== "string" || Number.isNaN(start.getTime())) return null;
    return { designerCode: v.d, start };
  } catch {
    return null;
  }
}

/**
 * Walks designers in round-robin order and returns up to `max` free starts from the FIRST designer
 * who has any, so the caller hears one designer's name. Preference filter first; if it leaves nothing,
 * falls back to any free time so the agent can still offer something.
 */
export function pickSlots<D extends { code: string }>(opts: {
  designersInOrder: D[];
  busyByCode: Record<string, Interval[]>;
  candidates: Date[];
  meetingMinutes: number;
  now: Date;
  preferredDay?: string;
  preferredTime?: TimeOfDay;
  max: number;
}): { designer: D; starts: Date[]; matchedPreference: boolean } | null {
  const { designersInOrder, busyByCode, candidates, meetingMinutes, now, preferredDay, preferredTime, max } = opts;
  const freeFor = (d: D, filter: boolean) =>
    candidates
      .filter((s) => !filter || matchesPreference(s, now, preferredDay, preferredTime))
      .filter((s) => isFree({ start: s, end: new Date(s.getTime() + meetingMinutes * 60_000) }, busyByCode[d.code] ?? []));

  for (const filter of [true, false]) {
    if (!filter && !preferredDay && !preferredTime) break;
    for (const d of designersInOrder) {
      const free = freeFor(d, filter);
      if (free.length) return { designer: d, starts: spreadPick(free, max), matchedPreference: filter };
    }
  }
  return null;
}

/** Offers varied options (not three back-to-back half hours): first free, then spaced through the list. */
export function spreadPick(starts: Date[], max: number): Date[] {
  if (starts.length <= max) return starts;
  const out: Date[] = [];
  const step = Math.max(1, Math.floor(starts.length / max));
  for (let i = 0; i < starts.length && out.length < max; i += step) out.push(starts[i]);
  return out;
}
