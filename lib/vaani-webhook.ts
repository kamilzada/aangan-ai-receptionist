/**
 * Vaani end-of-call webhook: auth + a typed, tolerant parser.
 * Shape from docs.vaanivoice.ai/guides/webhook-setup (call_postprocessing):
 *   { event, call_id, timestamp, data: { call_id, room_name, phone_number?, call_started_at?, call_ended_at?,
 *     call_duration (ms), end_reason, summary, entities, dispositions, recording_url, transcript: "[ts] SPEAKER: text" } }
 * Every raw payload is logged and stored (calls.raw) so the parser can be tightened against real calls.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Accepts any of: header x-vaani-secret (same secret as the tools), ?secret= on the URL
 * (for webhook UIs without custom headers), or Vaani's HMAC-SHA256 signature over the raw body
 * (X-Webhook-Signature / X-Vaani-Signature, keyed with VAANI_WEBHOOK_SECRET, falling back to VAANI_TOOL_SECRET).
 */
export function webhookAuthorized(req: Request, rawBody: string): boolean {
  const toolSecret = process.env.VAANI_TOOL_SECRET;
  const header = req.headers.get("x-vaani-secret");
  const query = new URL(req.url).searchParams.get("secret");
  if (toolSecret && ((header && safeEqual(header, toolSecret)) || (query && safeEqual(query, toolSecret)))) return true;

  const hmacSecret = process.env.VAANI_WEBHOOK_SECRET || toolSecret;
  const sig = (req.headers.get("x-webhook-signature") ?? req.headers.get("x-vaani-signature"))?.trim().replace(/^sha256=/i, "");
  if (!hmacSecret || !sig) return false;
  const ts = req.headers.get("x-vaani-timestamp") ?? req.headers.get("x-webhook-timestamp");
  for (const signed of ts ? [`${ts}.${rawBody}`, rawBody] : [rawBody]) {
    const mac = createHmac("sha256", hmacSecret).update(signed).digest();
    for (const enc of ["hex", "base64", "base64url"] as const) {
      if (safeEqual(mac.toString(enc), enc === "hex" ? sig.toLowerCase() : sig)) return true;
    }
  }
  return false;
}

const Turn = z.object({
  role: z.string().optional(),
  speaker: z.string().optional(),
  content: z.string().optional(),
  message: z.string().optional(),
  text: z.string().optional(),
});

const Data = z
  .object({
    call_id: z.string().optional(),
    room_name: z.string().optional(),
    phone_number: z.union([z.string(), z.number()]).optional(),
    from: z.string().optional(),
    caller_number: z.string().optional(),
    call_started_at: z.string().optional(),
    call_ended_at: z.string().optional(),
    call_duration: z.number().optional(),
    end_reason: z.string().optional(),
    summary: z.string().optional(),
    recording_url: z.string().optional(),
    transcript: z.union([z.string(), z.array(Turn)]).optional(),
  })
  .passthrough();

const Envelope = z
  .object({
    event: z.string().optional(),
    call_id: z.string().optional(),
    room_name: z.string().optional(),
    phone_number: z.union([z.string(), z.number()]).optional(),
    from: z.string().optional(),
    timestamp: z.string().optional(),
    data: Data.optional(),
  })
  .passthrough();

export type VaaniCall = {
  event: string;
  callId: string | null;
  callerPhone: string | null;
  startedAt: Date;
  durationSec: number;
  transcript: string;
  summary: string;
  endReason: string;
  recordingUrl: string | null;
};

/** Vaani omits the zone on some timestamps; those are UTC. */
function parseTime(s: string | undefined): Date | null {
  if (!s) return null;
  const t = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Indian numbers to +91XXXXXXXXXX; anything else kept as digits with a leading +. Null for browser test calls. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

export function parseVaaniPayload(body: unknown): VaaniCall {
  const e = Envelope.parse(body ?? {});
  const d = e.data ?? {};
  const transcript = Array.isArray(d.transcript)
    ? d.transcript.map((t) => `${(t.role ?? t.speaker ?? "speaker").toUpperCase()}: ${t.content ?? t.message ?? t.text ?? ""}`).join("\n")
    : (d.transcript ?? "");

  const started = parseTime(d.call_started_at);
  const ended = parseTime(d.call_ended_at);
  let durationSec = 0;
  if (started && ended) durationSec = Math.max(0, (ended.getTime() - started.getTime()) / 1000);
  // Docs say milliseconds; anything over two hours as "seconds" must really be ms.
  else if (d.call_duration) durationSec = d.call_duration > 7200 ? d.call_duration / 1000 : d.call_duration;

  const endTime = ended ?? parseTime(e.timestamp) ?? new Date();
  return {
    event: e.event ?? "call_postprocessing",
    callId: d.call_id ?? e.call_id ?? d.room_name ?? e.room_name ?? null,
    callerPhone: normalizePhone(d.phone_number ?? d.caller_number ?? d.from ?? e.phone_number ?? e.from),
    startedAt: started ?? new Date(endTime.getTime() - durationSec * 1000),
    durationSec: Math.round(durationSec),
    transcript: transcript.trim(),
    summary: d.summary ?? "",
    endReason: d.end_reason ?? "",
    recordingUrl: d.recording_url ?? null,
  };
}
