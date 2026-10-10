import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderConfirmation } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { istInstant } from "@/lib/slots";

const start = istInstant(2026, 9, 13, 16 * 60);
const end = new Date(start.getTime() + 30 * 60_000);
const email = {
  to: "priya@example.com",
  clientName: "Priya Kulkarni",
  designerName: "Ananya",
  when: "Tuesday 13 October at 4 pm",
  start,
  end,
  address: "Aangan Studio, Prabhat Road, Pune",
  eventId: "evt123",
};

describe("confirmation email", () => {
  const { subject, html, text } = renderConfirmation(email);

  it("has designer, time, address and reschedule line", () => {
    for (const body of [html, text]) {
      expect(body).toContain("Ananya");
      expect(body).toContain("Tuesday 13 October at 4 pm");
      expect(body).toContain("Prabhat Road, Pune");
      expect(body.toLowerCase()).toContain("reply to this email to reschedule");
    }
    expect(subject).toContain("Ananya");
    expect(html).toContain("Dear Priya,");
  });

  it("never mentions money", () => {
    const pricing = readFileSync(path.resolve(__dirname, "../context/pricing.md"), "utf8");
    const figures = [...pricing.matchAll(/₹\s?[\d,.]+|\d[\d,.]*\s?(?:lakh|L\b|k\b|\/sq)/gi)].map((m) => m[0].trim());
    for (const body of [html, text, subject]) {
      expect(body).not.toMatch(/₹|lakh|rupee|price|cost|INR/i);
      for (const f of figures) expect(body).not.toContain(f);
    }
  });

  it("escapes caller-supplied text", () => {
    expect(renderConfirmation({ ...email, clientName: "<script>x</script>" }).html).not.toContain("<script>x");
  });
});

describe("ics invite", () => {
  const ics = buildIcs({
    uid: "evt123@aangan",
    start,
    end,
    summary: "Design meeting with Ananya · Aangan Studio",
    description: "Line one\nLine two, with comma; and semicolon",
    location: "Aangan Studio, Prabhat Road, Pune",
    now: new Date("2026-10-10T05:00:00Z"),
  });

  it("is a valid single event in UTC", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261013T103000Z"); // 4 pm IST
    expect(ics).toContain("DTEND:20261013T110000Z");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics.replace(/\r\n /g, "")).toContain("Line one\\nLine two\\, with comma\\; and semicolon");
  });

  it("folds long lines at 75 octets", () => {
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });
});
