# Next steps

Phases 1–2 are coded. To see them work you need three keys, then Claude Code can take over.

## 1. Keys (about 20 minutes)
Copy `.env.example` to `.env.local` and fill in:

| Key | Where to get it |
|---|---|
| `VAANI_TOOL_SECRET` | Make up a long random string. You'll paste the same value into Vaani's custom tools as the `x-vaani-secret` header. |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `_PRIVATE_KEY` | console.cloud.google.com → new project → enable "Google Calendar API" → IAM → Service accounts → create → Keys → add JSON key. Copy `client_email` and `private_key`. |
| `DESIGNERS_JSON` | For the demo, make 2 Google Calendars (e.g. "Designer Ananya", "Designer Rohan"). In each calendar's settings, **share with the service account email** with "Make changes to events", and copy its Calendar ID. |

## 2. Run it
```
npm install
npm test                       # 13 unit tests
npm run replay                 # 20 September calls through Gemini; target 18+/20
npm run dev                    # then, in another terminal:
./scripts/test-endpoints.sh    # books a test meeting in a designer calendar
```

## 3. Hand over to Claude Code
Open this folder in Terminal, run `claude`, and paste:

> Read CLAUDE.md (especially Status) and NEXT_STEPS.md. Run `npm test` and `npm run replay` and show me the results; fix the classification prompt in lib/classify.ts if fewer than 18/20 match. Then build Phase 3 (Telegram bot: designer registration via /start <code>, briefs replacing the stub in lib/notify.ts) and Phase 4 (Resend email with .ics, only when email_confirmation is yes). Ask me for each key when you need it; never print secrets.

## 4. Connect Vaani (after deploying to Vercel)
In Vaani → Tools & Actions → New Action → Create Custom Tool, make two tools:
- **check_designer_slots** · POST `https://<your-app>.vercel.app/api/vaani/slots` · header `x-vaani-secret` · parameters: `preferred_day` (optional), `preferred_time` (optional: morning/afternoon/evening).
- **book_designer_meeting** · POST `https://<your-app>.vercel.app/api/vaani/book` · same header · parameters: `slot_id`, `caller_name`, `caller_phone`, `locality`, `property_type`, `carpet_area_sqft` (optional), `scope`, `timeline`, `budget_note` (optional), `source` (optional), `email_confirmation` (yes/no), `email` (optional).
Map the reply fields `say` / `spoken_confirmation` so the agent reads them aloud. Paste `agent/system-prompt.md` into the agent and upload `context/services.md` and `context/qualified.md` to its knowledge base (**not** pricing.md).
