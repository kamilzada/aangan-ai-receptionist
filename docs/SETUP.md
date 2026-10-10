# Setup: keys, services, deploy

Every secret goes in `.env.local` (local) and in Vercel → Project → Settings → Environment Variables (production).
Never commit them. `.env.example` lists every variable.

Nothing in this guide costs money: Gemini, Supabase, Telegram, HubSpot, Resend and Vercel all have free tiers that are enough for the demo.

---

## 1. Shared secrets (2 min)

Generate three random strings in Terminal (run it three times):

```bash
openssl rand -hex 24
```

| Variable | Used for |
|---|---|
| `VAANI_TOOL_SECRET` | Header `x-vaani-secret` on both Vaani tools and the webhook |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram sends it back so we know updates are real |
| `DASHBOARD_PASSCODE` | What Rahul types to open `/dashboard` (pick something memorable instead if you like) |

## 2. Gemini (3 min)
aistudio.google.com → **Get API key** → **Create API key** → `GEMINI_API_KEY`.
Then run `npm run replay`. The target is 18 or more of the 20 September calls matching.

## 3. Google Calendar (15 min)
1. console.cloud.google.com → create a project → **APIs & Services → Library** → enable **Google Calendar API**.
2. **IAM & Admin → Service accounts → Create**. No roles needed. Open it → **Keys → Add key → JSON**.
3. From the JSON: `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
   (keep the `\n`s and wrap the value in double quotes).
4. calendar.google.com → **Other calendars → + → Create new calendar** twice: "Designer Ananya" and "Designer Rohan".
   For each: **Settings and sharing → Share with specific people →** the service-account email, **Make changes to events**.
   Copy the **Calendar ID** (under *Integrate calendar*).

## 4. Supabase (5 min)
1. supabase.com → **New project** (free).
2. **SQL Editor → New query** → paste `supabase/migrations/001_init.sql` → **Run**.
3. Seed the designers (use the calendar IDs from step 3):
   ```sql
   insert into designers (code, name, calendar_id, sort_order) values
     ('ananya', 'Ananya', '<calendar id 1>', 1),
     ('rohan',  'Rohan',  '<calendar id 2>', 2);
   ```
4. **Project Settings → API**: `Project URL` → `SUPABASE_URL`, `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`.

Without Supabase the app still runs locally from `DESIGNERS_JSON`, but Telegram registration and idempotency need it.

## 5. Telegram (5 min)
1. In Telegram, message **@BotFather** → `/newbot` → name it e.g. "Aangan Studio Bookings" → copy the token → `TELEGRAM_BOT_TOKEN`.
2. After deploying (step 8), run `npm run telegram:setup -- https://<your-app>.vercel.app`.
   It sets the webhook and prints one link per designer (`https://t.me/<bot>?start=ananya`).
   The designer taps it, presses **Start**, and gets "you're registered".
3. Nikhil's chat id: Nikhil messages the bot once, then open `https://api.telegram.org/bot<token>/getUpdates`
   and copy `message.chat.id` → `NIKHIL_TELEGRAM_CHAT_ID`. For the demo, use your own chat id.

## 6. HubSpot (10 min)
1. Create a free HubSpot account.
2. **Settings (gear) → Integrations → Private apps** (may be listed under *Legacy apps*) → **Create**.
   Scopes: `crm.objects.contacts.read/write`, `crm.objects.deals.read/write`, `crm.schemas.contacts.write`,
   and the calls scopes if listed (`crm.objects.calls.read/write`, `crm.schemas.calls.write`) → copy the token → `HUBSPOT_PRIVATE_APP_TOKEN`.
3. `npm run hubspot:setup`: creates 6 custom properties (5 on Calls, 1 on Contacts) and checks the deal stage.

**Free-plan limits, and what we chose:** 10 custom properties per account, 1 deal pipeline, 2 users.
So the call details live as custom properties **on the Call record**. Booked meetings become deals in the default
"Sales Pipeline" at the built-in **Appointment scheduled** stage (rename it "Designer meeting booked" if you like),
and the designer's name goes in the deal name, because designers aren't HubSpot users.

## 7. Resend (5 min)
resend.com → **API Keys → Create** → `RESEND_API_KEY`.
Until you verify a domain, set `EMAIL_FROM="Aangan Studio <onboarding@resend.dev>"`. Resend then only delivers
to the email you signed up with, so use that address as the "caller" email in test calls.
Set `EMAIL_REPLY_TO` to the inbox that should get "reply to reschedule" emails.

## 8. Deploy to Vercel (10 min)
1. Create an **empty private** repo on github.com (no README), then:
   ```bash
   git remote add origin https://github.com/<you>/aangan-ai-receptionist.git
   git push -u origin main
   ```
2. vercel.com → **Add New → Project → Import** the repo. Framework: Next.js (auto-detected).
3. **Environment Variables:** add everything from your `.env.local` except `DESIGNERS_JSON` (Supabase holds the roster).
   Paste `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` exactly as in `.env.local`.
4. **Deploy.** Your production URL is `https://<project>.vercel.app`.
5. Check it:
   ```bash
   ./scripts/test-endpoints.sh https://<project>.vercel.app
   ```
   Then open `https://<project>.vercel.app/dashboard`.
6. Run `npm run telegram:setup -- https://<project>.vercel.app`, then follow `docs/VAANI_SETUP.md`.

After changing an env var in Vercel, **redeploy** (Deployments → ⋯ → Redeploy) so the change takes effect.
