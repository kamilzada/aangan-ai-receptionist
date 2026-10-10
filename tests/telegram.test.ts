import { describe, expect, it } from "vitest";
import { briefFlags, buildBrief, type Lead } from "@/lib/brief";
import { isAfterHours } from "@/lib/hours";
import { istInstant, shortWhen } from "@/lib/slots";
import { parseStart } from "@/lib/telegram";

const lead: Lead = {
  caller_name: "Priya",
  caller_phone: "+919800000000",
  locality: "Kothrud (Dahanukar Colony)",
  property_type: "3BHK",
  carpet_area_sqft: 1400,
  scope: "full home: kitchen, living, both bedrooms",
  timeline: "done by March, flexible",
  source: "referral (Shruti Joshi)",
  email_confirmation: "no",
};

describe("telegram /start parsing", () => {
  it("reads the designer code", () => {
    expect(parseStart("/start Ananya")).toEqual({ code: "ananya" });
    expect(parseStart("/start@AanganBot rohan")).toEqual({ code: "rohan" });
    expect(parseStart("/start")).toEqual({ code: null });
    expect(parseStart("hello")).toBeNull();
    expect(parseStart(undefined)).toBeNull();
  });
});

describe("designer brief", () => {
  it("matches the CLAUDE.md format", () => {
    const start = istInstant(2026, 9, 13, 16 * 60); // Tue 13 Oct 2026, 4 pm IST
    const brief = buildBrief(lead, shortWhen(start), { emailStatus: "declined", flags: [] });
    expect(brief.split("\n")).toEqual([
      "New meeting · Tue 13 Oct, 4:00 pm",
      "Caller: Priya · +919800000000",
      "Site: 3BHK, Kothrud (Dahanukar Colony), ~1,400 sq ft",
      "Scope: full home: kitchen, living, both bedrooms",
      "Timeline: done by March, flexible",
      "Source: referral (Shruti Joshi)",
      "Budget: not mentioned",
      "Email confirmation: client declined; confirm by phone",
      "Flags: none",
      "Transcript: in HubSpot after the call ends",
    ]);
  });

  it("reports email status and flags", () => {
    const withEmail = { ...lead, email_confirmation: "yes" as const, email: "priya@example.com", carpet_area_sqft: undefined };
    const brief = buildBrief(withEmail, "x", { emailStatus: "sent", flags: briefFlags(withEmail, istInstant(2026, 9, 12, 22 * 60), isAfterHours) });
    expect(brief).toContain("Email confirmation: sent to priya@example.com");
    expect(brief).toContain("Flags: called after hours; size not given");
  });
});

describe("after hours", () => {
  it("uses front desk hours Mon–Sat 10–7 IST", () => {
    expect(isAfterHours(istInstant(2026, 9, 12, 10 * 60 + 23))).toBe(false); // Mon 10:23
    expect(isAfterHours(istInstant(2026, 9, 12, 19 * 60))).toBe(true); // Mon 19:00
    expect(isAfterHours(istInstant(2026, 9, 12, 9 * 60 + 44))).toBe(true); // Mon 09:44 (T07)
    expect(isAfterHours(istInstant(2026, 9, 11, 12 * 60))).toBe(true); // Sunday
  });
});
