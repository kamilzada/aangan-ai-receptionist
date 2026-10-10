/**
 * Notification hooks called after a booking. Phase 2: log only.
 * Phase 3 replaces sendDesignerBrief with Telegram; Phase 4 replaces sendClientEmail with Resend + .ics.
 */
import type { Designer } from "./designers";
import type { Lead } from "./brief";

export async function sendDesignerBrief(designer: Designer, brief: string): Promise<"sent" | "skipped"> {
  console.log(`[notify] Telegram brief for ${designer.code} (Phase 3 not built yet)\n${brief}`);
  return "skipped";
}

export async function sendClientEmail(lead: Lead, when: string, designer: Designer): Promise<"sent" | "skipped"> {
  if (lead.email_confirmation !== "yes" || !lead.email) return "skipped";
  console.log(`[notify] Email to ${lead.email} for ${when} with ${designer.name} (Phase 4 not built yet)`);
  return "skipped";
}
