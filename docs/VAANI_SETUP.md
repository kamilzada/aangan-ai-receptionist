# Connect Vaani (app.vaanivoice.ai)

Replace `<APP>` with your production URL (e.g. `https://aangan-ai-receptionist.vercel.app`)
and `<SECRET>` with `VAANI_TOOL_SECRET`. Menu names may differ slightly; look for the closest match.

## 1. Agent prompt and knowledge
1. **Agents** → open (or create) the Aangan agent.
2. **Prompt / Instructions**: paste everything below the `---` line in `agent/system-prompt.md`.
3. **Knowledge base**: upload `context/services.md` and `context/qualified.md`. **Do not upload `context/pricing.md`.**
4. Languages: English, Hindi, Marathi. Save.

## 2. Tool 1: `check_designer_slots`
**Tools & Actions → New Action → Create Custom Tool**
- Name: `check_designer_slots`
- Description: *Find free meeting times with a designer. Call this before offering times to the caller.*
- Method / URL: `POST` `<APP>/api/vaani/slots`
- Headers: `x-vaani-secret: <SECRET>` and `Content-Type: application/json`
- Parameters (both optional, type string):
  - `preferred_day`: "today", "tomorrow", a weekday like "tuesday", or YYYY-MM-DD
  - `preferred_time`: one of `morning`, `afternoon`, `evening`
- Response: tell the agent to read `say` aloud and keep each `slot_id` for booking.
  (Reply: `{ ok, designer_name, slots: [{ slot_id, spoken, ... }], say }`.)
- Save → **Test**: you should get 3 slots.

## 3. Tool 2: `book_designer_meeting`
- Name: `book_designer_meeting`
- Description: *Book the chosen slot after collecting the caller's details and asking about email confirmation.*
- Method / URL: `POST` `<APP>/api/vaani/book`, same two headers
- Parameters (string unless noted):
  | Name | Required | Notes |
  |---|---|---|
  | `slot_id` | yes | from `check_designer_slots` |
  | `caller_name` | yes | |
  | `caller_phone` | yes | the caller's number |
  | `locality` | yes | e.g. "Kothrud" |
  | `property_type` | yes | e.g. "3BHK", "office" |
  | `carpet_area_sqft` | no | number, if given |
  | `scope` | yes | rooms to redo |
  | `timeline` | yes | when they want it done |
  | `budget_note` | no | only if the caller volunteered it |
  | `source` | no | how they heard of Aangan |
  | `email_confirmation` | yes | `yes` or `no` |
  | `email` | no | only when `email_confirmation` = yes, after spelling it back |
- Response: read `spoken_confirmation` aloud when `ok` is true. Otherwise read `say` and offer the `alternatives`.

## 4. End-of-call webhook
**Developers → Webhooks** (or Settings → Webhooks) → **Add webhook**
- URL: `<APP>/api/vaani/webhook`
- Custom header, if offered: `x-vaani-secret: <SECRET>`.
  If headers can't be set, use `<APP>/api/vaani/webhook?secret=<SECRET>` as the URL instead.
  If Vaani shows its own signing secret, put that value in `VAANI_WEBHOOK_SECRET` in Vercel and redeploy.
- Events: **call_postprocessing** (required) and **call_started** (gives us the caller's number early).
- Save, then make one test call.

## 5. Check the first real payload
Vercel → Project → **Logs** → filter `vaani webhook`. You'll see `payload {...}` then `result {...}`.
- `result` should show `status: "done"` with a call type and outcome, and a `hubspotCallId`.
- If a field came through empty (e.g. no phone number), copy the payload into a new test in
  `tests/webhook.test.ts` and adjust `lib/vaani-webhook.ts`. Supabase also keeps every payload in `calls.raw`.
- Once it's confirmed, set `VAANI_LOG_PAYLOADS=false` (transcripts are personal data).

## 6. Phone forwarding
On the studio line, set call forwarding on **no answer, busy and unreachable** to the Vaani number,
and after hours forward everything. (Carrier codes vary; Jio/Airtel: `**61*<number>#` for no answer,
`**67*<number>#` for busy, `**62*<number>#` for unreachable.)
