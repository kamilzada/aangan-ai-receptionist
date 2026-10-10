/**
 * Gemini Flash classification of a call transcript. Used by scripts/replay-transcripts.ts now,
 * and by the Vaani end-of-call webhook in Phase 5.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const CallClassification = z.object({
  call_type: z.enum(["new_lead", "complaint", "repeat_caller", "dropped", "other"]),
  outcome: z.enum(["booked", "declined", "deferred", "escalated", "no_booking"]),
  decline_reason: z
    .enum([
      "outside_service_area",
      "advice_only",
      "out_of_scope_type",
      "timeline_under_6_weeks",
      "budget_clearly_too_low",
      "too_small",
      "none",
    ])
    .default("none"),
  locality: z.string().default(""),
  property_type: z.string().default(""),
  carpet_area_sqft: z.number().nullable().default(null),
  scope: z.string().default(""),
  timeline: z.string().default(""),
  budget_note: z.string().default(""),
  summary: z.string().default(""),
  caller_name: z.string().default(""),
  caller_email: z.string().default(""),
});
export type CallClassification = z.infer<typeof CallClassification>;

const jsonSchema = {
  type: "object",
  properties: {
    call_type: { type: "string", enum: ["new_lead", "complaint", "repeat_caller", "dropped", "other"] },
    outcome: { type: "string", enum: ["booked", "declined", "deferred", "escalated", "no_booking"] },
    decline_reason: {
      type: "string",
      enum: ["outside_service_area", "advice_only", "out_of_scope_type", "timeline_under_6_weeks", "budget_clearly_too_low", "too_small", "none"],
    },
    locality: { type: "string" },
    property_type: { type: "string" },
    carpet_area_sqft: { type: ["number", "null"] },
    scope: { type: "string" },
    timeline: { type: "string" },
    budget_note: { type: "string" },
    summary: { type: "string", description: "One sentence for the designer." },
    caller_name: { type: "string", description: "Caller's name if they said it, else empty." },
    caller_email: { type: "string", description: "Email address the caller confirmed, else empty." },
  },
  required: ["call_type", "outcome", "decline_reason", "summary"],
};

export const CLASSIFY_INSTRUCTIONS = `You classify phone calls to Aangan Studio, an interior design studio in Pune.
Return JSON only, matching the schema.

call_type:
- complaint: an EXISTING client unhappy about an ongoing project (mentions their designer, delays, no replies). These are never qualified or declined; outcome = escalated.
- repeat_caller: a prospective client calling again because an earlier enquiry was not followed up.
- dropped: missed call, no answer, or the line dropped before any project details and the caller did not get through.
- new_lead: anyone else asking about a design project (even if the call was briefly cut off and they called back successfully).
- other: vendors, job seekers, wrong numbers.

outcome for new_lead / repeat_caller, judged on what the studio's rules say, not only on what the front desk happened to do:
- declined, with decline_reason, if ANY of these clearly applies:
  outside_service_area: site is outside Pune city and PCMC (e.g. Nashik, Mumbai, Talegaon, Lonavala).
  advice_only: wants ideas, colours, styling or a consultation without design + execution.
  out_of_scope_type: restaurant, hotel, retail store, gym; architecture/structural work; furniture sourcing alone; Vastu advice alone.
  too_small: commercial space under about 500 sq ft.
  budget_clearly_too_low: caller VOLUNTEERED a budget far below the scope (e.g. 1-1.5 lakh for kitchen + bedroom with execution).
- deferred (decline_reason = timeline_under_6_weeks): needs the project finished in under 6 weeks; may come back later.
- booked: otherwise, if it is a real project in the area. Do NOT decline for: asking about price, not knowing exact needs, calling after hours, a single room with execution, a rented home without structural changes, or the caller not being the owner/decision-maker (the studio does not check decision-makers).
- no_booking: a new lead that is in scope but ended without a booking for another reason.
For complaint use outcome = escalated. For dropped use outcome = no_booking.
decline_reason = none unless declined or deferred.
Never include any price figure in the output.`;

let ai: GoogleGenAI | null = null;

export async function classifyTranscript(transcript: string): Promise<CallClassification> {
  return (await classifyWithUsage(transcript)).result;
}

export async function classifyWithUsage(
  transcript: string,
): Promise<{ result: CallClassification; usage: { input: number; output: number } }> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: `${CLASSIFY_INSTRUCTIONS}\n\nTRANSCRIPT:\n${transcript}`,
    config: { responseMimeType: "application/json", responseJsonSchema: jsonSchema, temperature: 0 },
  });
  const result = CallClassification.parse(JSON.parse(res.text ?? "{}"));
  const u = res.usageMetadata;
  return {
    result,
    usage: { input: u?.promptTokenCount ?? 0, output: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) },
  };
}
