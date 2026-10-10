/** The designer brief: the calendar event description and the Telegram message (format from CLAUDE.md). */
export type Lead = {
  caller_name: string;
  caller_phone: string;
  locality: string;
  property_type: string;
  carpet_area_sqft?: number;
  scope: string;
  timeline: string;
  budget_note?: string;
  email_confirmation: "yes" | "no";
  email?: string;
  source?: string;
};

export type EmailStatus = "sent" | "pending" | "failed" | "declined";

export function buildBrief(
  lead: Lead,
  when: string,
  opts: { heading?: string; emailStatus?: EmailStatus; flags?: string[]; transcript?: string } = {},
): string {
  const size = lead.carpet_area_sqft ? `, ~${lead.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : "";
  const status: EmailStatus = opts.emailStatus ?? (lead.email_confirmation === "yes" && lead.email ? "pending" : "declined");
  const email = {
    sent: `sent to ${lead.email}`,
    pending: `requested (${lead.email})`,
    failed: `FAILED to send to ${lead.email}; please confirm by phone`,
    declined: "client declined; confirm by phone",
  }[status];
  return [
    `${opts.heading ?? "New meeting"} · ${when}`,
    `Caller: ${lead.caller_name} · ${lead.caller_phone}`,
    `Site: ${lead.property_type}, ${lead.locality}${size}`,
    `Scope: ${lead.scope}`,
    `Timeline: ${lead.timeline}`,
    `Source: ${lead.source || "not mentioned"}`,
    `Budget: ${lead.budget_note || "not mentioned"}`,
    `Email confirmation: ${email}`,
    `Flags: ${opts.flags?.length ? opts.flags.join("; ") : "none"}`,
    `Transcript: ${opts.transcript ?? "in HubSpot after the call ends"}`,
  ].join("\n");
}

/** Things the designer should know before the meeting. */
export function briefFlags(lead: Lead, bookedAt: Date, isAfterHours: (d: Date) => boolean): string[] {
  const flags: string[] = [];
  if (isAfterHours(bookedAt)) flags.push("called after hours");
  if (lead.budget_note) flags.push("caller mentioned budget");
  if (!lead.carpet_area_sqft) flags.push("size not given");
  return flags;
}
