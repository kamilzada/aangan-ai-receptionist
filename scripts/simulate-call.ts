/**
 * Sends a September transcript to the webhook in Vaani's call_postprocessing format, so the whole
 * post-call pipeline (Gemini → Telegram alert → HubSpot → dashboard) can be tested without phoning.
 * Run: npm run simulate-call -- T09 [base_url]      (default http://localhost:3000)
 * Re-running with the same id shows idempotency (second response: "duplicate").
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { splitPhoneCalls } from "./replay-transcripts";

loadEnv({ path: ".env.local" });

async function main() {
  const id = (process.argv[2] ?? "T01").toUpperCase();
  const base = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
  const raw = readFileSync(path.resolve(__dirname, "../context/enquiries-sept-2026.txt"), "utf8");
  const text = splitPhoneCalls(raw)[id];
  if (!text) throw new Error(`No transcript ${id}`);

  const lines = text.split("\n").slice(1).join("\n");
  const transcript = lines
    .replace(/^Front Desk:/gm, "AGENT:")
    .replace(/^Caller:/gm, "USER:")
    .split("\n")
    .map((l) => (l.trim() ? `[00:00] ${l}` : l))
    .join("\n");

  const ended = new Date();
  const started = new Date(ended.getTime() - 4 * 60_000);
  const callId = `sim-${id}-${process.env.SIM_RUN ?? "1"}`;
  const payload = {
    event: "call_postprocessing",
    call_id: callId,
    timestamp: ended.toISOString(),
    data: {
      room_name: callId,
      call_id: callId,
      phone_number: `+9198000000${id.slice(1)}`,
      call_started_at: started.toISOString(),
      call_ended_at: ended.toISOString(),
      call_duration: 4 * 60_000,
      end_reason: "Call ended",
      summary: "",
      recording_url: "",
      transcript,
    },
  };

  const res = await fetch(`${base}/api/vaani/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vaani-secret": process.env.VAANI_TOOL_SECRET ?? "" },
    body: JSON.stringify(payload),
  });
  console.log(res.status, await res.text());
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
