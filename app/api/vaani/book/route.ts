import { z } from "zod";
import { hasVaaniSecret, unauthorized } from "@/lib/auth";
import { briefFlags, buildBrief, type EmailStatus, type Lead } from "@/lib/brief";
import { config } from "@/lib/config";
import { findDesigner } from "@/lib/designers";
import { freeBusy, insertEvent } from "@/lib/google-calendar";
import { sendClientEmail, sendDesignerBrief } from "@/lib/notify";
import { getStore } from "@/lib/roundrobin";
import { candidateStarts, decodeSlotId, encodeSlotId, isFree, shortWhen, spoken, spreadPick } from "@/lib/slots";
import { db, dbEnabled } from "@/lib/db";
import { isAfterHours } from "@/lib/hours";
import { normalizePhone } from "@/lib/vaani-webhook";
import { readToolParams } from "@/lib/vaani";
import { toolFailure } from "@/lib/errors";

export const dynamic = "force-dynamic";

const optionalText = z.string().trim().optional().transform((v) => (v ? v : undefined));

const Input = z
  .object({
    slot_id: z.string().min(4),
    caller_name: z.string().trim().min(1),
    caller_phone: z.string().trim().min(6),
    locality: z.string().trim().min(1),
    property_type: z.string().trim().min(1),
    carpet_area_sqft: z.coerce.number().positive().optional().catch(undefined),
    scope: z.string().trim().min(1),
    timeline: z.string().trim().min(1),
    budget_note: optionalText,
    source: optionalText,
    email_confirmation: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (["yes", "y", "true", "haan", "ho"].includes(v) ? "yes" : "no") as "yes" | "no"),
    email: z.string().trim().toLowerCase().email().optional().catch(undefined),
  })
  .transform((v): Lead & { slot_id: string } => v);

export async function POST(req: Request) {
  if (!hasVaaniSecret(req)) return unauthorized();
  try {
    return await handle(req);
  } catch (err) {
    return toolFailure("book", err);
  }
}

async function handle(req: Request): Promise<Response> {

  const parsed = Input.safeParse(await readToolParams(req));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => String(i.path[0]));
    const words: Record<string, string> = {
      slot_id: "which time you'd like",
      caller_name: "your name",
      caller_phone: "your phone number",
      locality: "which area the home is in",
      property_type: "what kind of home or office it is",
      scope: "which rooms you'd like to redo",
      timeline: "when you'd like it complete",
      email_confirmation: "whether you'd like an email confirmation",
    };
    const ask = [...new Set(fields)].map((f) => words[f] ?? f);
    return Response.json(
      { ok: false, reason: "missing_details", missing: fields, say: `Just before I book, could you tell me ${ask.join(", and ")}?` },
      { status: 400 },
    );
  }
  const lead = parsed.data;

  const slot = decodeSlotId(lead.slot_id);
  const designer = slot ? await findDesigner(slot.designerCode) : undefined;
  if (!slot || !designer) {
    return Response.json({ ok: false, reason: "unknown_slot", say: "Let me check the available times again." }, { status: 400 });
  }

  const start = slot.start;
  const end = new Date(start.getTime() + config.meetingMinutes * 60_000);
  const now = new Date();

  // Re-check: someone may have taken the slot since it was offered.
  const horizonEnd = new Date(now.getTime() + (config.daysAhead + 1) * 86_400_000);
  const { busy } = await freeBusy([designer.calendarId], now, horizonEnd);
  const designerBusy = busy[designer.calendarId] ?? [];
  if (start.getTime() < now.getTime() || !isFree({ start, end }, designerBusy)) {
    const free = candidateStarts({
      now,
      hours: config.hours,
      meetingMinutes: config.meetingMinutes,
      minLeadMinutes: config.minLeadMinutes,
      daysAhead: config.daysAhead,
    }).filter((s) => isFree({ start: s, end: new Date(s.getTime() + config.meetingMinutes * 60_000) }, designerBusy));
    const alternatives = spreadPick(free, config.maxSlotsOffered).map((s) => ({
      slot_id: encodeSlotId(designer.code, s),
      designer_name: designer.name,
      start_iso: s.toISOString(),
      spoken: spoken(s),
    }));
    return Response.json({
      ok: false,
      reason: "slot_taken",
      alternatives,
      say: alternatives.length
        ? `Sorry, that time was just taken. ${designer.name} is also free on ${alternatives.map((a) => a.spoken).join(", or ")}.`
        : "Sorry, that time was just taken. Let me take your details and the team will call you back to fix a time.",
    });
  }

  const when = spoken(start);
  const flags = briefFlags(lead, now, isAfterHours);
  const event = await insertEvent(designer.calendarId, {
    summary: `Aangan design meeting · ${lead.caller_name} (${lead.property_type}, ${lead.locality})`,
    description: buildBrief(lead, shortWhen(start), { heading: "Designer meeting", flags }),
    location: config.studioAddress,
    start,
    end,
    privateProps: { source: "aangan-ai-receptionist", caller_phone: lead.caller_phone },
  });

  await getStore().setLastCode(designer.code);
  if (dbEnabled()) {
    await db
      .insert("bookings", {
        caller_phone: normalizePhone(lead.caller_phone) ?? lead.caller_phone,
        caller_name: lead.caller_name,
        designer_code: designer.code,
        start_at: start.toISOString(),
        event_id: event.id,
      })
      .catch((err) => console.error("[book] could not record booking", err));
  }

  // Email first so the designer's brief can say whether the client got it.
  const clientEmail = await sendClientEmail(lead, { start, end, when, eventId: event.id }, designer);
  const emailStatus: EmailStatus =
    lead.email_confirmation !== "yes" || !lead.email ? "declined" : clientEmail === "sent" ? "sent" : "failed";
  const designerBrief = await sendDesignerBrief(designer, buildBrief(lead, shortWhen(start), { emailStatus, flags }));

  return Response.json({
    ok: true,
    event_id: event.id,
    designer_name: designer.name,
    start_iso: start.toISOString(),
    designer_brief: designerBrief,
    client_email: clientEmail,
    spoken_confirmation: `You're booked with ${designer.name} on ${when} at Aangan Studio.`,
  });
}
