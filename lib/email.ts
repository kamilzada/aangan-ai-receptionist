/**
 * Client confirmation email (Resend), sent only when the caller said yes and gave an address.
 * Warm-minimal studio look: linen, oak, terracotta, serif headings. Never mentions prices.
 */
import { buildIcs } from "./ics";

export type ConfirmationEmail = {
  to: string;
  clientName: string;
  designerName: string;
  when: string; // "Tuesday 14 October at 4 pm"
  start: Date;
  end: Date;
  address: string;
  eventId: string;
};

const C = { linen: "#F5F0E8", oak: "#B08A5E", terracotta: "#C46A4A", charcoal: "#2B2925", stone: "#E2DACD", white: "#FFFDF9" };
const SERIF = "'Cormorant Garamond', 'Fraunces', Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

export function renderConfirmation(e: ConfirmationEmail): { subject: string; html: string; text: string } {
  const subject = `Your meeting with ${e.designerName} at Aangan Studio · ${e.when}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`;
  const row = (label: string, value: string, link?: string) => `
          <tr>
            <td style="padding:14px 0;border-top:1px solid ${C.stone};font:500 11px/1.4 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.oak};width:110px;vertical-align:top;">${label}</td>
            <td style="padding:14px 0;border-top:1px solid ${C.stone};font:400 16px/1.5 ${SANS};color:${C.charcoal};">${link ? `<a href="${link}" style="color:${C.charcoal};text-decoration:underline;text-decoration-color:${C.stone};">${esc(value)}</a>` : esc(value)}</td>
          </tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@400;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.linen};">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(e.designerName)} will meet you on ${esc(e.when)}. The calendar invite is attached.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.linen};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 8px 28px;font:500 12px/1 ${SANS};letter-spacing:.32em;text-transform:uppercase;color:${C.oak};">Aangan&nbsp;Studio</td></tr>
        <tr><td style="background:${C.white};border:1px solid ${C.stone};border-radius:12px;padding:40px 32px;">
          <div style="width:40px;height:2px;background:${C.terracotta};margin:0 0 24px;"></div>
          <h1 style="margin:0 0 12px;font:400 34px/1.15 ${SERIF};color:${C.charcoal};">Your design meeting is booked</h1>
          <p style="margin:0 0 28px;font:400 16px/1.6 ${SANS};color:${C.charcoal};">
            Dear ${esc(firstName(e.clientName))}, thank you for calling us. ${esc(e.designerName)} is looking forward to hearing about your home and what you'd like it to become.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row("Designer", e.designerName)}${row("When", e.when)}${row("Where", e.address, maps)}
          </table>
          <p style="margin:28px 0 0;padding:18px 20px;background:${C.linen};border-radius:12px;font:400 15px/1.6 ${SANS};color:${C.charcoal};">
            Need a different time? Simply <strong style="font-weight:500;">reply to this email to reschedule</strong> and we'll find one that suits you.
          </p>
          <p style="margin:24px 0 0;font:400 14px/1.6 ${SANS};color:#6B645A;">
            If you have floor plans or photos of the space, do bring them along. The calendar invite is attached to this email.
          </p>
        </td></tr>
        <tr><td style="padding:24px 8px 0;font:400 22px/1.3 ${SERIF};color:${C.oak};">Warmly, Aangan Studio</td></tr>
        <tr><td style="padding:8px 8px 0;font:400 12px/1.6 ${SANS};color:#8A8276;">${esc(e.address)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Dear ${firstName(e.clientName)},`,
    "",
    "Your design meeting at Aangan Studio is booked.",
    "",
    `Designer: ${e.designerName}`,
    `When: ${e.when}`,
    `Where: ${e.address}`,
    "",
    "Need a different time? Reply to this email to reschedule.",
    "The calendar invite is attached.",
    "",
    "Warmly,",
    "Aangan Studio",
  ].join("\n");

  return { subject, html, text };
}

export function resendEnabled(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendConfirmationEmail(e: ConfirmationEmail): Promise<void> {
  const { subject, html, text } = renderConfirmation(e);
  const ics = buildIcs({
    uid: `${e.eventId}@aangan-ai-receptionist`,
    start: e.start,
    end: e.end,
    summary: `Design meeting with ${e.designerName} · Aangan Studio`,
    description: `Your meeting with ${e.designerName} at Aangan Studio. Reply to the confirmation email to reschedule.`,
    location: e.address,
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [e.to],
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
      subject,
      html,
      text,
      attachments: [{ filename: "aangan-meeting.ics", content: Buffer.from(ics).toString("base64"), content_type: "text/calendar" }],
    }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
}
