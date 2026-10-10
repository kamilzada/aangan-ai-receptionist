/** Booking configuration, read from env with sensible defaults. All times are Asia/Kolkata (UTC+5:30, no DST). */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type BookingHours = {
  weekdays: Set<number>; // 0 = Sunday
  startMinutes: number; // minutes after midnight IST
  endMinutes: number;
};

/** Parses strings like "Mon-Sat 10:00-18:00". */
export function parseBookingHours(raw: string | undefined): BookingHours {
  const value = (raw ?? "Mon-Sat 10:00-18:00").trim();
  const m = value.match(/^([A-Za-z]{3})-([A-Za-z]{3})\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`BOOKING_HOURS must look like "Mon-Sat 10:00-18:00", got "${value}"`);
  const from = DAY_NAMES.findIndex((d) => d.toLowerCase() === m[1].toLowerCase());
  const to = DAY_NAMES.findIndex((d) => d.toLowerCase() === m[2].toLowerCase());
  if (from < 0 || to < 0) throw new Error(`Unknown day in BOOKING_HOURS: "${value}"`);
  const weekdays = new Set<number>();
  for (let i = from; ; i = (i + 1) % 7) {
    weekdays.add(i);
    if (i === to) break;
  }
  return {
    weekdays,
    startMinutes: Number(m[3]) * 60 + Number(m[4]),
    endMinutes: Number(m[5]) * 60 + Number(m[6]),
  };
}

export const config = {
  meetingMinutes: Number(process.env.MEETING_MINUTES ?? 30),
  minLeadMinutes: Number(process.env.MIN_LEAD_MINUTES ?? 120),
  daysAhead: Number(process.env.BOOKING_DAYS_AHEAD ?? 7),
  maxSlotsOffered: 3,
  studioAddress: process.env.STUDIO_ADDRESS ?? "Aangan Studio, Pune",
  get hours(): BookingHours {
    return parseBookingHours(process.env.BOOKING_HOURS);
  },
};
