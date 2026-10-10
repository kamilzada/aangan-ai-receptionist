import { z } from "zod";
import { hasVaaniSecret, unauthorized } from "@/lib/auth";
import { config } from "@/lib/config";
import { loadDesigners } from "@/lib/designers";
import { freeBusy } from "@/lib/google-calendar";
import { getStore, rotate } from "@/lib/roundrobin";
import { candidateStarts, encodeSlotId, pickSlots, spoken, type Interval } from "@/lib/slots";
import { readToolParams } from "@/lib/vaani";
import { toolFailure } from "@/lib/errors";

export const dynamic = "force-dynamic";

const Input = z.object({
  preferred_day: z.string().trim().optional().catch(undefined),
  preferred_time: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(["morning", "afternoon", "evening"]))
    .optional()
    .catch(undefined),
});

export async function POST(req: Request) {
  if (!hasVaaniSecret(req)) return unauthorized();
  try {
    return await handle(req);
  } catch (err) {
    return toolFailure("slots", err);
  }
}

async function handle(req: Request): Promise<Response> {
  const input = Input.parse(await readToolParams(req));

  const now = new Date();
  const hours = config.hours;
  const candidates = candidateStarts({
    now,
    hours,
    meetingMinutes: config.meetingMinutes,
    minLeadMinutes: config.minLeadMinutes,
    daysAhead: config.daysAhead,
  });
  if (!candidates.length) {
    return Response.json({ ok: false, slots: [], message: "No bookable times in the next week." });
  }

  const designers = rotate(loadDesigners(), await getStore().getLastCode());
  const timeMax = new Date(candidates[candidates.length - 1].getTime() + config.meetingMinutes * 60_000);
  const { busy, errors } = await freeBusy(designers.map((d) => d.calendarId), candidates[0], timeMax);
  if (Object.keys(errors).length) console.warn("[slots] calendars not readable:", errors);

  const busyByCode: Record<string, Interval[]> = {};
  const readable = designers.filter((d) => busy[d.calendarId]);
  for (const d of readable) busyByCode[d.code] = busy[d.calendarId];

  const pick = pickSlots({
    designersInOrder: readable,
    busyByCode,
    candidates,
    meetingMinutes: config.meetingMinutes,
    now,
    preferredDay: input.preferred_day,
    preferredTime: input.preferred_time,
    max: config.maxSlotsOffered,
  });

  if (!pick) {
    return Response.json({
      ok: false,
      slots: [],
      message: "No designer has a free slot in the next week. Take the caller's details and promise a call back.",
    });
  }

  return Response.json({
    ok: true,
    designer_name: pick.designer.name,
    matched_preference: pick.matchedPreference,
    slots: pick.starts.map((s) => ({
      slot_id: encodeSlotId(pick.designer.code, s),
      designer_name: pick.designer.name,
      start_iso: s.toISOString(),
      spoken: spoken(s),
    })),
    say: pick.matchedPreference
      ? `${pick.designer.name} is free on ${pick.starts.map(spoken).join(", or ")}.`
      : `That time isn't available, but ${pick.designer.name} is free on ${pick.starts.map(spoken).join(", or ")}.`,
  });
}
