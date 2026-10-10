/** The designer brief. Used as the calendar event description now, and as the Telegram message in Phase 3. */
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

export function buildBrief(lead: Lead, when: string): string {
  const size = lead.carpet_area_sqft ? `, ~${lead.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : "";
  const email =
    lead.email_confirmation === "yes" && lead.email ? `sent to ${lead.email}` : "client declined email; confirm by phone";
  return [
    `Designer meeting · ${when}`,
    `Caller: ${lead.caller_name} · ${lead.caller_phone}`,
    `Site: ${lead.property_type}, ${lead.locality}${size}`,
    `Scope: ${lead.scope}`,
    `Timeline: ${lead.timeline}`,
    `Source: ${lead.source || "not mentioned"}`,
    `Budget: ${lead.budget_note || "not mentioned"}`,
    `Email confirmation: ${email}`,
    `Booked by the Aangan AI receptionist.`,
  ].join("\n");
}
