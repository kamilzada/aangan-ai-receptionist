/** Front desk hours (default Mon–Sat 10:00–19:00 IST). Anything outside counts as an after-hours call. */
import { parseBookingHours } from "./config";
import { istParts } from "./slots";

export function isAfterHours(at: Date, raw = process.env.FRONT_DESK_HOURS ?? "Mon-Sat 10:00-19:00"): boolean {
  const h = parseBookingHours(raw);
  const p = istParts(at);
  return !h.weekdays.has(p.weekday) || p.minutesOfDay < h.startMinutes || p.minutesOfDay >= h.endMinutes;
}
