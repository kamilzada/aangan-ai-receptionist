# Aangan Studio — AI Phone Receptionist

MESA Case 03 (Founder's Office, Cohort C4). Build for **incoming phone calls only**.
Aangan Studio is an interior design studio in Pune (founder: Nikhil Deshpande, 14 designers).
~200 enquiries/month, ~48% get no reply within 48 h, a third arrive outside 10am–7pm.
Answered within 1 h converts at 4x a next-day reply. Average project ₹8–14 lakh.

Goal: every call the front desk misses is answered by an AI voice agent within seconds,
the lead is qualified, a meeting with a designer is booked in that designer's Google Calendar,
the designer gets a brief on Telegram, and every call lands in HubSpot and on a dashboard.

## Locked decisions (do not change without asking the user)

| Area | Decision |
|---|---|
| Voice + telephony | Vaani AI (app.vaanivoice.ai). Studio line forwards to Vaani on no-answer, busy, and after hours. |
| Qualification rules | `context/qualified.md`, **minus criterion 5** (decision-maker). Leads are scored on 4 criteria. The agent never asks who the decision-maker is. |
| Question order | Location → house size (type + carpet sq ft, never pushed) → scope → timeline → book. |
| Pricing | Never say any number, range or per-sq-ft rate. First mention: "It's best to come to pricing after you meet the designer and they understand your requirements." Only if the caller pushes again: the approved line from `context/pricing.md`. Asking about price never disqualifies. |
| Booking | A **meeting with a designer** (not a site visit), in **that designer's own Google Calendar**. Round-robin across designers who have a free slot. |
| Designer handoff | Telegram bot. Each designer taps Start once to register. |
| Client confirmation | **Email, only if the caller says yes** when asked. Sent with Resend, with an .ics invite attached. Agent spells the address back before sending. |
| Complaints from existing clients | No qualification. Urgent Telegram alert to Nikhil / senior designer; caller promised a senior callback within 15 min. |
| Call classification + field extraction | Gemini Flash (cheap, fast) on the post-call transcript. |
| Records | HubSpot (free CRM) is the system of record for every call. |
| Dashboard | Our own Next.js page deployed on **Vercel**, reading from HubSpot, for **Rahul**. Sleek, modern interior-design look (see Design). |
| State | Supabase (or Neon): designer roster, Telegram chat ids, round-robin pointer, idempotency of webhooks. |
| Repo | GitHub. Never commit secrets. |

Vaani has **no** Google Calendar or HubSpot integration (checked 10 Oct 2026; it offers WhatsApp, Cal.com, Google Sheets).
It does support **custom tools** (agent calls an HTTPS endpoint mid-call with extracted parameters and reads the JSON reply)
and **webhooks** (Developers → Webhooks). Everything below plugs into those two.

## Architecture

```
Caller ──► Studio line ──(no answer / busy / after hours)──► Vaani agent
                                                              │  knowledge: services.md, qualified.md (NOT pricing.md numbers)
                                                              │
           mid-call custom tools ─────────────────────────────┤
             POST /api/vaani/slots   → free slots across designers (Google Calendar freebusy)
             POST /api/vaani/book    → create event in chosen designer's calendar
                                       → Telegram brief to designer
                                       → Resend email + .ics to client (only if email_confirmation = yes)
                                                              │
           end-of-call webhook ───────────────────────────────┘
             POST /api/vaani/webhook → Gemini Flash classifies + extracts fields
                                     → HubSpot: contact + call record (+ deal if qualified)
                                     → Telegram alert if complaint
                                     → Supabase call log (idempotent on call id)

Rahul ──► /dashboard (Vercel, passcode) ──► HubSpot API (server-side only)
```

## Endpoints (Next.js App Router, TypeScript, deployed on Vercel)

All `/api/vaani/*` routes require header `x-vaani-secret: $VAANI_TOOL_SECRET`. Reject otherwise.
All times in `Asia/Kolkata`.

### `POST /api/vaani/slots`
Input: `{ preferred_day?: string, preferred_time?: "morning"|"afternoon"|"evening" }`
Logic: Google Calendar freebusy for every active designer → candidate 30-min slots inside bookable hours,
at least 2 h from now → walk designers in round-robin order → return up to 3 slots from the first designer(s) with space.
Output: `{ slots: [{ slot_id, designer_name, start_iso, spoken: "Tuesday 14 October at 4 pm" }] }`
(`spoken` is what the agent reads aloud.)

### `POST /api/vaani/book`
Input: `{ slot_id, caller_name, caller_phone, locality, property_type, carpet_area_sqft?, scope, timeline, budget_note?, email_confirmation: "yes"|"no", email? }`
Logic: re-check the slot is still free (race) → create event in the designer's calendar (no attendees; client details + brief in description) →
advance round-robin pointer → Telegram brief to designer → if `email_confirmation=yes` and email present, Resend email with .ics.
Output: `{ ok: true, spoken_confirmation: "You're booked with Ananya on Tuesday at 4 pm." }` or `{ ok: false, reason, alternatives: [...] }`.

Note: a Google **service account cannot add attendees** without Workspace domain-wide delegation. That is why the client invite goes as an .ics attachment on the Resend email, not as a Calendar attendee.

### `POST /api/vaani/webhook`
The payload shape is not documented here. **First step: log one real payload** (Vaani → Developers → Webhooks / Logs) and write a typed parser from it.
Then: Gemini Flash on the transcript → `{ call_type: new_lead|complaint|repeat_caller|dropped|other, outcome: booked|declined|deferred|no_booking, decline_reason?, locality, property_type, carpet_area_sqft, scope, timeline, budget_note, summary }`
(JSON schema output; validate with zod). Upsert HubSpot contact by phone → log call → create deal when booked.
Complaint → urgent Telegram to `NIKHIL_TELEGRAM_CHAT_ID`. Idempotent on Vaani call id.

### Telegram bot
`POST /api/telegram/webhook`: on `/start <designer_code>` save `chat_id` against that designer in Supabase.
Brief format (one message):
```
New meeting · Tue 14 Oct, 4:00 pm
Caller: Priya · +91…
Site: 3BHK, Kothrud (Dahanukar Colony), ~1,400 sq ft
Scope: full home: kitchen, living, both bedrooms
Timeline: done by March, flexible
Source: referral (Shruti Joshi)
Budget: not mentioned
Email confirmation: sent / client declined
Flags: none
Transcript: <link>
```

### `/dashboard`
Server-rendered, passcode via `DASHBOARD_PASSCODE` (cookie). Reads HubSpot server-side; token never reaches the browser.
Metrics: calls handled by AI, after-hours share, meetings booked, booking rate on qualified leads,
decline reasons (outside area, advice only, out-of-scope type, timeline, budget, too small),
complaints escalated, daily trend, latest calls table. (AI cost removed at the user's request, 10 Oct 2026.)
Do **not** track how many callers want email confirmation (user said not needed).

## HubSpot data model (verify free-plan limits before building)
- Contact: phone (key), name, email, locality.
- Call/engagement per call, linked to contact, with custom properties: `aangan_call_type`, `aangan_outcome`,
  `aangan_decline_reason`, `aangan_after_hours`, `aangan_vaani_call_id`.
- Deal for booked meetings, pipeline "AI receptionist", stage "Designer meeting booked", owner = designer.
If custom properties on calls are not available on the free plan, store them on a Deal per call instead, and say so.

## Agent behaviour
The Vaani agent prompt lives in `agent/system-prompt.md`. Treat it as source code: changes go through review
and are re-tested against the September transcripts.

## Design (dashboard + client email)
Warm minimal, like a high-end Pune design studio: linen background `#F5F0E8`, oak `#B08A5E`, terracotta accent `#C46A4A`,
charcoal text `#2B2925`, soft stone borders `#E2DACD`. Serif headings (e.g. Cormorant Garamond / Fraunces),
clean sans body (Inter). Generous whitespace, thin rules, rounded 12px cards, no heavy shadows. Must work on a phone.

## Defaults where Nikhil's files disagree (flag in the debrief)
- Commercial minimum: 500 sq ft (front desk practice in T18; not in services.md).
- Timeline: decline only if the caller needs it **finished in under 6 weeks** (services.md; T07). Otherwise qualify.
- One clear fail on area, scope or timeline, or a volunteered budget that is clearly too low → decline politely.
- Meeting: 30 min, Mon–Sat 10:00–18:00, in person at the studio unless the designer changes it (configurable).

## Build order (each phase ends with something demoable)
1. **Agent prompt** (`agent/system-prompt.md`) + `tests/expected-outcomes.json`; a script that runs the 20 phone transcripts through Gemini Flash classification and reports matches.
2. Next.js skeleton, env handling, `/api/vaani/slots` and `/api/vaani/book` against 2–3 test Google Calendars.
3. Telegram bot registration + briefs.
4. Resend email + .ics (yes-only).
5. Vaani webhook → Gemini → HubSpot (+ complaint alert).
6. Dashboard on Vercel with the design above.
7. End-to-end test calls acting out T01 (book), T03 (outside area), T09 (complaint), T13 (pushes on price twice), T17 (dropped call).

## Rules for working in this repo
- Secrets only in `.env.local` / Vercel env. Keep `.env.example` updated. Never print tokens.
- Never put numbers from `context/pricing.md` into the agent prompt, knowledge base, emails or dashboard.
- Ask the user before creating paid resources or sending real messages to real people.
- Prefer small, typed modules: `lib/google-calendar.ts`, `lib/hubspot.ts`, `lib/telegram.ts`, `lib/resend.ts`, `lib/gemini.ts`, `lib/roundrobin.ts`.

## Status (10 Oct 2026)
- All phases coded; 36 unit tests, typecheck and production build pass. Nothing has run against live services yet (no keys in `.env.local`).
- Phase 1: replay run 10 Oct 2026: **20/20 match** `tests/expected-outcomes.json`. `gemini-2.5-flash` is closed to new keys, so the default is `gemini-3.8-flash` with fallbacks `gemini-3.5-flash`, `gemini-3.1-flash-lite` (free tier = 20 requests/day per model, 5/min). The replay is paced at 12.5 s per call; run a subset with `npm run replay -- T09 T12`.
- Phase 2: booking endpoints not yet run against real Google Calendars.
- Phase 3: Telegram registration (`/api/telegram/webhook`) + briefs; roster, chat ids, round-robin and bookings in Supabase (`supabase/migrations/001_init.sql`), falling back to `DESIGNERS_JSON` + memory without Supabase.
- Phase 4: Resend email + .ics, sent only on `email_confirmation = yes`.
- Phase 5: `/api/vaani/webhook`. Parser built from Vaani's documented `call_postprocessing` shape, **not yet confirmed against a real payload**. Auth: `x-vaani-secret`, `?secret=` or HMAC. HubSpot uses 6 of the free plan's 10 custom properties (5 on Calls, 1 on Contacts); deals go in the default pipeline at "Appointment scheduled".
- Phase 6: `/dashboard` (passcode cookie); shows sample data until HubSpot is configured. **AI cost was removed** at the user's request.
- Phase 7: `docs/SETUP.md`, `docs/VAANI_SETUP.md`, `docs/TEST_PLAN.md`.
