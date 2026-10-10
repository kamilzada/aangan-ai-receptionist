import { processVaaniCall } from "@/lib/process-call";
import { webhookAuthorized } from "@/lib/vaani-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vaani end-of-call webhook. Auth: x-vaani-secret header, ?secret=, or Vaani's HMAC signature. */
export async function POST(req: Request) {
  const rawText = await req.text();
  if (!webhookAuthorized(req, rawText)) {
    console.warn("[vaani webhook] rejected: bad or missing secret/signature");
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  // Logged in full so the first real payload can be inspected (Vercel → Logs). Transcripts contain personal data;
  // set VAANI_LOG_PAYLOADS=false once the parser is confirmed.
  if (process.env.VAANI_LOG_PAYLOADS !== "false") console.log("[vaani webhook] payload", rawText.slice(0, 20_000));

  try {
    const result = await processVaaniCall(body, rawText);
    console.log("[vaani webhook] result", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[vaani webhook] failed", err);
    // 500 so Vaani retries; the call id makes the retry safe.
    return Response.json({ ok: false, reason: "processing_failed" }, { status: 500 });
  }
}
