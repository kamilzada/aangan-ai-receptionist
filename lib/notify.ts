/**
 * Notifications after a booking or a call. Failures are logged and reported, never thrown:
 * the caller is already booked and the voice agent must still hear a confirmation.
 */
import type { Designer } from "./designers";
import type { Lead } from "./brief";
import { sendTelegram, telegramEnabled } from "./telegram";

export type SendResult = "sent" | "skipped" | "failed";

export async function sendDesignerBrief(designer: Designer, brief: string): Promise<SendResult> {
  if (!telegramEnabled() || !designer.telegramChatId) {
    console.warn(`[notify] no Telegram chat for ${designer.code}; brief not sent\n${brief}`);
    return "skipped";
  }
  try {
    await sendTelegram(designer.telegramChatId, brief);
    return "sent";
  } catch (err) {
    console.error(`[notify] Telegram brief to ${designer.code} failed`, err);
    return "failed";
  }
}

export type Meeting = { start: Date; end: Date; when: string; eventId: string };

export async function sendClientEmail(lead: Lead, meeting: Meeting, designer: Designer): Promise<SendResult> {
  if (lead.email_confirmation !== "yes" || !lead.email) return "skipped";
  console.log(`[notify] Email to ${lead.email} for ${meeting.when} with ${designer.name} (Phase 4 not built yet)`);
  return "skipped";
}
