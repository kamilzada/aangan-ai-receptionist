/**
 * Notifications after a booking or a call. Failures are logged and reported, never thrown:
 * the caller is already booked and the voice agent must still hear a confirmation.
 */
import type { Designer } from "./designers";
import type { Lead } from "./brief";
import { sendTelegram, telegramEnabled } from "./telegram";
import { resendEnabled, sendConfirmationEmail } from "./email";
import { config } from "./config";

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
  if (!resendEnabled()) {
    console.warn("[notify] RESEND_API_KEY / EMAIL_FROM not set; confirmation email not sent");
    return "failed";
  }
  try {
    await sendConfirmationEmail({
      to: lead.email,
      clientName: lead.caller_name,
      designerName: designer.name,
      when: meeting.when,
      start: meeting.start,
      end: meeting.end,
      address: config.studioAddress,
      eventId: meeting.eventId,
    });
    return "sent";
  } catch (err) {
    console.error("[notify] confirmation email failed", err);
    return "failed";
  }
}
