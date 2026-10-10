/**
 * One finished Vaani call → classification → complaint alert → HubSpot (contact, deal if booked, call).
 * Idempotent on the Vaani call id: Supabase `calls` row when configured, plus a HubSpot lookup as a second guard.
 */
import { createHash } from "node:crypto";
import { classifyTranscript, type CallClassification } from "./classify";
import { db, dbEnabled } from "./db";
import { isAfterHours } from "./hours";
import { createCall, createDeal, findCallByVaaniId, hubspotEnabled, upsertContactByPhone } from "./hubspot";
import { shortWhen } from "./slots";
import { sendTelegram, telegramEnabled } from "./telegram";
import { parseVaaniPayload, type VaaniCall } from "./vaani-webhook";

export type ProcessResult =
  | { status: "ignored"; reason: string }
  | { status: "duplicate"; callId: string }
  | {
      status: "done";
      callId: string;
      classification: Pick<CallClassification, "call_type" | "outcome" | "decline_reason">;
      hubspotCallId: string | null;
      complaintAlert: "sent" | "skipped" | "failed";
    };

type CallRow = { vaani_call_id: string; status: string; caller_phone: string | null };

/** Claims the call for processing. False if it is already done or being processed. */
async function claim(callId: string, raw: unknown, phone: string | null): Promise<{ ok: boolean; phone: string | null }> {
  const reclaimed = await db.update<CallRow>(
    "calls",
    { vaani_call_id: `eq.${callId}`, status: "in.(started,failed)" },
    { status: "processing", raw, updated_at: new Date().toISOString() },
  );
  if (reclaimed.length) return { ok: true, phone: phone ?? reclaimed[0].caller_phone };
  const inserted = await db.insert("calls", { vaani_call_id: callId, status: "processing", raw, caller_phone: phone });
  return { ok: inserted, phone };
}

async function finish(callId: string, patch: Record<string, unknown>) {
  if (!dbEnabled()) return;
  await db
    .update("calls", { vaani_call_id: `eq.${callId}` }, { ...patch, updated_at: new Date().toISOString() })
    .catch((err) => console.error("[process-call] could not update call log", err));
}

const DROPPED: CallClassification = {
  call_type: "dropped",
  outcome: "no_booking",
  decline_reason: "none",
  locality: "",
  property_type: "",
  carpet_area_sqft: null,
  scope: "",
  timeline: "",
  budget_note: "",
  summary: "Call ended before any details were shared.",
  caller_name: "",
  caller_email: "",
};

export async function processVaaniCall(raw: unknown, rawText: string): Promise<ProcessResult> {
  const call = parseVaaniPayload(raw);
  const callId = call.callId ?? `body-${createHash("sha256").update(rawText).digest("hex").slice(0, 24)}`;

  // call_started carries the caller's number; remember it for when post-processing arrives.
  if (call.event === "call_started") {
    if (dbEnabled() && call.callerPhone) {
      await db.insert("calls", { vaani_call_id: callId, status: "started", caller_phone: call.callerPhone, raw });
    }
    return { status: "ignored", reason: "call_started noted" };
  }
  if (!["call_postprocessing", "call_ended", "call_no_answer", "call_failed"].includes(call.event)) {
    return { status: "ignored", reason: `event ${call.event}` };
  }
  // Prefer post-processing (has the transcript); a bare call_ended is skipped when post-processing will follow.
  if (call.event === "call_ended" && !call.transcript) return { status: "ignored", reason: "waiting for call_postprocessing" };

  if (dbEnabled()) {
    const c = await claim(callId, raw, call.callerPhone);
    if (!c.ok) return { status: "duplicate", callId };
    call.callerPhone = c.phone;
  } else if (hubspotEnabled() && (await findCallByVaaniId(callId))) {
    return { status: "duplicate", callId };
  }

  try {
    const result = await handle(call, callId);
    await finish(callId, {
      status: "done",
      call_type: result.classification.call_type,
      outcome: result.classification.outcome,
      hubspot_call_id: result.hubspotCallId,
      error: null,
    });
    return result;
  } catch (err) {
    await finish(callId, { status: "failed", error: String((err as Error).message ?? err).slice(0, 1000) });
    throw err;
  }
}

async function handle(call: VaaniCall, callId: string): Promise<Extract<ProcessResult, { status: "done" }>> {
  let cls: CallClassification = DROPPED;
  const hasConversation = call.transcript.replace(/\[[^\]]*\]/g, "").length > 80;
  if (hasConversation && !["call_no_answer", "call_failed"].includes(call.event)) {
    cls = await classifyTranscript(call.transcript);
  }

  // Ground truth beats the model: if the booking endpoint booked this caller during the call, it's booked.
  const booking = await findBooking(call);
  if (booking && cls.call_type !== "complaint") {
    cls = { ...cls, outcome: "booked", decline_reason: "none", call_type: cls.call_type === "dropped" ? "new_lead" : cls.call_type };
    if (!cls.caller_name && booking.caller_name) cls.caller_name = booking.caller_name;
  }

  const afterHours = isAfterHours(call.startedAt);

  const complaintAlert = cls.call_type === "complaint" ? await alertNikhil(call, cls) : "skipped";

  let hubspotCallId: string | null = null;
  if (hubspotEnabled()) {
    const contactId = call.callerPhone
      ? await upsertContactByPhone({
          phone: call.callerPhone,
          name: cls.caller_name,
          email: cls.caller_email || undefined,
          locality: cls.locality || undefined,
        })
      : undefined;
    const who = cls.caller_name || call.callerPhone || "Unknown caller";
    const dealId =
      cls.outcome === "booked"
        ? await createDeal({
            name: [who, [cls.property_type, cls.locality].filter(Boolean).join(" "), booking ? `${booking.designer_name}, ${shortWhen(new Date(booking.start_at))}` : ""]
              .filter(Boolean)
              .join(" · "),
            contactId,
            description: cls.summary,
            closeDate: booking ? new Date(booking.start_at) : undefined,
          })
        : undefined;
    hubspotCallId = await createCall({
      vaaniCallId: callId,
      title: `${who} · ${cls.call_type.replace(/_/g, " ")} · ${cls.outcome.replace(/_/g, " ")}`,
      body: callBody(call, cls, booking),
      startedAt: call.startedAt,
      durationSec: call.durationSec,
      fromNumber: call.callerPhone ?? undefined,
      recordingUrl: call.recordingUrl ?? undefined,
      callType: cls.call_type,
      outcome: cls.outcome,
      declineReason: cls.decline_reason,
      afterHours,
      contactId,
      dealId,
    });
  } else {
    console.warn("[process-call] HUBSPOT_PRIVATE_APP_TOKEN not set; call not recorded in HubSpot");
  }

  return {
    status: "done",
    callId,
    classification: { call_type: cls.call_type, outcome: cls.outcome, decline_reason: cls.decline_reason },
    hubspotCallId,
    complaintAlert,
  };
}

type Booking = { caller_name: string | null; start_at: string; designer_name: string };

async function findBooking(call: VaaniCall): Promise<Booking | null> {
  if (!dbEnabled() || !call.callerPhone) return null;
  const since = new Date(call.startedAt.getTime() - 10 * 60_000).toISOString();
  const rows = await db
    .select<{ caller_name: string | null; start_at: string; designers: { name: string } | null }>("bookings", {
      select: "caller_name,start_at,designers(name)",
      caller_phone: `eq.${call.callerPhone}`,
      created_at: `gte.${since}`,
      order: "created_at.desc",
      limit: "1",
    })
    .catch(() => []);
  const r = rows[0];
  return r ? { caller_name: r.caller_name, start_at: r.start_at, designer_name: r.designers?.name ?? "designer" } : null;
}

async function alertNikhil(call: VaaniCall, cls: CallClassification): Promise<"sent" | "skipped" | "failed"> {
  const chat = process.env.NIKHIL_TELEGRAM_CHAT_ID;
  if (!telegramEnabled() || !chat) {
    console.warn("[process-call] complaint alert not sent: TELEGRAM_BOT_TOKEN / NIKHIL_TELEGRAM_CHAT_ID missing");
    return "skipped";
  }
  const fmt = (d: Date) => shortWhen(d).split(", ")[1];
  const ended = new Date(call.startedAt.getTime() + call.durationSec * 1000);
  const text = [
    "🚨 URGENT · complaint from an existing client",
    `Caller: ${cls.caller_name || "name not given"} · ${call.callerPhone ?? "number withheld"}`,
    `Issue: ${cls.summary || "see transcript in HubSpot"}`,
    `Call ended ${fmt(ended)}. The caller was promised a senior callback within 15 minutes (by ${fmt(new Date(ended.getTime() + 15 * 60_000))}).`,
  ].join("\n");
  try {
    await sendTelegram(chat, text);
    return "sent";
  } catch (err) {
    console.error("[process-call] complaint alert failed", err);
    return "failed";
  }
}

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function callBody(call: VaaniCall, cls: CallClassification, booking: Booking | null): string {
  const lines = [
    `<b>${esc(cls.summary || call.summary || "No summary")}</b>`,
    "",
    cls.locality && `Locality: ${esc(cls.locality)}`,
    cls.property_type && `Property: ${esc(cls.property_type)}${cls.carpet_area_sqft ? `, ~${cls.carpet_area_sqft} sq ft` : ""}`,
    cls.scope && `Scope: ${esc(cls.scope)}`,
    cls.timeline && `Timeline: ${esc(cls.timeline)}`,
    cls.budget_note && `Budget note: ${esc(cls.budget_note)}`,
    booking && `Meeting: ${esc(booking.designer_name)}, ${shortWhen(new Date(booking.start_at))}`,
    cls.decline_reason !== "none" && `Decline reason: ${cls.decline_reason.replace(/_/g, " ")}`,
    "",
    "<b>Transcript</b>",
    esc(call.transcript.slice(0, 50_000) || "(no transcript)"),
  ];
  return lines
    .filter((l) => l !== false && l !== null && l !== undefined)
    .join("<br>")
    .replace(/\n/g, "<br>");
}
