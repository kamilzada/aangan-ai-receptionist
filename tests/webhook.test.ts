import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePhone, parseVaaniPayload, webhookAuthorized } from "@/lib/vaani-webhook";

// The documented call_postprocessing example (docs.vaanivoice.ai/guides/webhook-setup), plus a phone number.
const docExample = {
  event: "call_postprocessing",
  call_id: "inbound-1784899978-36cec598",
  timestamp: "2026-10-12T13:34:22.278854+00:00",
  data: {
    room_name: "inbound-1784899978-36cec598",
    call_id: "inbound-1784899978-36cec598",
    phone_number: "09876543210",
    call_duration: 55150.022999999994,
    end_reason: "Call ended",
    summary: "Caller wants a 3BHK redesign in Kothrud.",
    entities: {},
    dispositions: {},
    recording_url: "https://example.com/rec.mp3",
    transcript: "[00:01] AGENT: Hello, thank you for calling Aangan Studio.\n[00:04] USER: Hi, I'm Priya.",
  },
};

describe("Vaani payload parser", () => {
  it("reads the documented shape", () => {
    const c = parseVaaniPayload(docExample);
    expect(c.event).toBe("call_postprocessing");
    expect(c.callId).toBe("inbound-1784899978-36cec598");
    expect(c.callerPhone).toBe("+919876543210");
    expect(c.durationSec).toBe(55); // call_duration is milliseconds
    expect(c.transcript).toContain("USER: Hi, I'm Priya.");
    expect(c.recordingUrl).toBe("https://example.com/rec.mp3");
    expect(c.startedAt.toISOString().slice(0, 19)).toBe("2026-10-12T13:33:27");
  });

  it("prefers start/end timestamps and accepts transcript arrays", () => {
    const c = parseVaaniPayload({
      event: "call_postprocessing",
      data: {
        call_id: "x",
        call_started_at: "2026-10-12T05:00:00",
        call_ended_at: "2026-10-12T05:04:30",
        call_duration: 270,
        transcript: [
          { role: "agent", content: "Hello" },
          { role: "user", message: "Hi" },
        ],
      },
    });
    expect(c.durationSec).toBe(270);
    expect(c.startedAt.toISOString()).toBe("2026-10-12T05:00:00.000Z");
    expect(c.transcript).toBe("AGENT: Hello\nUSER: Hi");
  });

  it("reads the real events Vaani sent in its connectivity test (10 Oct 2026)", () => {
    const post = parseVaaniPayload({
      event: "call_postprocessing",
      call_id: "test_room_123",
      timestamp: "2026-10-10T13:32:30.688387+00:00",
      data: {
        room_name: "test_room_123",
        call_id: "test_room_123",
        call_duration: 120,
        end_reason: "completed",
        summary: "This is a sample summary for testing.",
        entities: { customer_name: "John Doe", intent: "inquiry" },
        dispositions: { call_disposition: "Interested" },
        recording_url: "https://example.com/recording.mp3",
        transcript: "Agent: Hello\nUser: Hi",
      },
    });
    expect(post).toMatchObject({ event: "call_postprocessing", callId: "test_room_123", durationSec: 120, transcript: "Agent: Hello\nUser: Hi" });
    const started = parseVaaniPayload({
      event: "call_started",
      data: { room_name: "test_room_123", call_id: "test_room_123", phone_number: "+919876543210", call_type: "Outbound" },
    });
    expect(started).toMatchObject({ event: "call_started", callId: "test_room_123", callerPhone: "+919876543210" });
  });

  it("survives an empty body", () => {
    const c = parseVaaniPayload({});
    expect(c.callId).toBeNull();
    expect(c.transcript).toBe("");
  });

  it("normalises phone numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalizePhone(919876543210)).toBe("+919876543210");
    expect(normalizePhone("web-call")).toBeNull();
  });
});

describe("webhook auth", () => {
  beforeEach(() => {
    process.env.VAANI_TOOL_SECRET = "tool-secret-1234567890";
    delete process.env.VAANI_WEBHOOK_SECRET;
  });
  const req = (headers: Record<string, string>, url = "https://x.test/api/vaani/webhook") => new Request(url, { method: "POST", headers });

  it("accepts the shared header or ?secret=", () => {
    expect(webhookAuthorized(req({ "x-vaani-secret": "tool-secret-1234567890" }), "{}")).toBe(true);
    expect(webhookAuthorized(req({}, "https://x.test/api/vaani/webhook?secret=tool-secret-1234567890"), "{}")).toBe(true);
    expect(webhookAuthorized(req({ "x-vaani-secret": "wrong" }), "{}")).toBe(false);
    expect(webhookAuthorized(req({}), "{}")).toBe(false);
  });

  it("accepts a valid HMAC signature over the raw body", () => {
    process.env.VAANI_WEBHOOK_SECRET = "hmac-secret";
    const body = JSON.stringify(docExample);
    const hex = createHmac("sha256", "hmac-secret").update(body).digest("hex");
    expect(webhookAuthorized(req({ "x-webhook-signature": hex }), body)).toBe(true);
    expect(webhookAuthorized(req({ "x-webhook-signature": `sha256=${hex}` }), body)).toBe(true);
    expect(webhookAuthorized(req({ "x-webhook-signature": hex }), body + " ")).toBe(false);
  });
});

describe("processVaaniCall", () => {
  const sent: { chat: string | number; text: string }[] = [];
  beforeEach(() => {
    vi.resetModules();
    sent.length = 0;
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HUBSPOT_PRIVATE_APP_TOKEN"]) delete process.env[k];
    process.env.TELEGRAM_BOT_TOKEN = "t";
    process.env.NIKHIL_TELEGRAM_CHAT_ID = "42";
    vi.doMock("@/lib/telegram", () => ({
      telegramEnabled: () => true,
      sendTelegram: async (chat: string | number, text: string) => void sent.push({ chat, text }),
    }));
  });
  afterEach(() => vi.doUnmock("@/lib/telegram"));

  it("marks a call with no conversation as dropped without calling Gemini", async () => {
    vi.doMock("@/lib/classify", () => ({ classifyTranscript: vi.fn(() => Promise.reject(new Error("should not be called"))) }));
    const { processVaaniCall } = await import("@/lib/process-call");
    const r = await processVaaniCall({ event: "call_postprocessing", data: { call_id: "d1", transcript: "[00:01] AGENT: Hello?" } }, "{}");
    expect(r).toMatchObject({ status: "done", classification: { call_type: "dropped", outcome: "no_booking" } });
    vi.doUnmock("@/lib/classify");
  });

  it("alerts Nikhil on a complaint", async () => {
    vi.doMock("@/lib/classify", () => ({
      classifyTranscript: async () => ({
          call_type: "complaint",
          outcome: "escalated",
          decline_reason: "none",
          summary: "Existing client in Baner: work stalled for two weeks, designer not replying.",
          caller_name: "Sheetal",
          caller_email: "",
          locality: "Baner",
          property_type: "",
          carpet_area_sqft: null,
          scope: "",
          timeline: "",
          budget_note: "",
      }),
    }));
    const { processVaaniCall } = await import("@/lib/process-call");
    const transcript = "[00:01] USER: " + "My project has been stalled for two weeks and nobody is replying. ".repeat(3);
    const r = await processVaaniCall({ event: "call_postprocessing", data: { call_id: "c1", phone_number: "9822000000", transcript } }, "{}");
    expect(r).toMatchObject({ status: "done", complaintAlert: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0].chat).toBe("42");
    expect(sent[0].text).toContain("URGENT");
    expect(sent[0].text).toContain("Sheetal · +919822000000");
    expect(sent[0].text).toContain("within 15 minutes");
    vi.doUnmock("@/lib/classify");
  });

  it("ignores events other than the end of the call", async () => {
    const { processVaaniCall } = await import("@/lib/process-call");
    expect(await processVaaniCall({ event: "call_ringing", call_id: "r1" }, "{}")).toMatchObject({ status: "ignored" });
  });
});
