# End-to-end test plan: 5 calls

Before you start:
- The app is deployed, Vaani is connected (`docs/VAANI_SETUP.md`), and both designers have registered with the bot.
- `NIKHIL_TELEGRAM_CHAT_ID` is **your own** chat id, so the complaint alert reaches you and not Nikhil.
- For the email check, use the address you signed up to Resend with.
- Open in tabs: both designer calendars, Telegram, your inbox, HubSpot (Contacts, Deals, and a contact's Activity), and `/dashboard?days=7`.

Call from your own phone. Wait about 30 s after hanging up before checking: Vaani post-processes first.

> No real call? `npm run simulate-call -- T09 https://<app>` sends a September transcript through the
> same post-call pipeline (HubSpot, Telegram alert, dashboard). It doesn't test the voice part or the booking tools.

---

## Call 1: T01, a straightforward booking (with email)
**You say:** "Hi, I'm Priya. A friend, Shruti Joshi, recommended you. We have a 3BHK in Kothrud, Dahanukar Colony, about 1,400 square feet carpet. We want to redo the kitchen, living room and both bedrooms, done by March."
Pick the first slot offered. Say **yes** to email and spell your Resend address.

| Where | Expected |
|---|---|
| Agent | Asks location → size → scope → timeline, offers 3 slots with one designer, spells the email back, confirms designer + day + time. Never asks who decides. |
| Calendar | 30-min event "Aangan design meeting · Priya (3BHK, Kothrud…)" in the offered designer's calendar, with the brief in the description. |
| Telegram | That designer gets: `New meeting · <day>, <time>`, Caller, Site with ~1,400 sq ft, Scope, Timeline, Source: referral, `Email confirmation: sent to …`. |
| Email | "Your design meeting is booked" in linen/oak style: designer, day and time, studio address, "reply to reschedule", `aangan-meeting.ics` attached. No prices. |
| HubSpot | Contact with your phone, name Priya, locality. Call: `new_lead`, `booked`, after-hours flag correct for the time you called. Deal "Priya · 3BHK Kothrud · <designer>, <time>" at Appointment scheduled. |
| Dashboard | Calls +1, meetings booked +1; the call tops Latest calls with **Booked**. |

## Call 2: T03, outside the service area
**You say:** "My name is Suresh Patil, I'm in Nashik. Could you redo my home office and study?" Then push: "Not even a small project?"

| Where | Expected |
|---|---|
| Agent | Politely says Aangan only works in Pune and PCMC because contractors need to be on site. Offers no slots. |
| Calendar / Telegram / Email | Nothing. |
| HubSpot | Contact + Call: `new_lead`, `declined`, decline reason `outside_service_area`. No deal. |
| Dashboard | Calls +1. "Outside Pune / PCMC" goes up by 1 under *Why leads were declined*. Booking rate is unchanged (declines don't count as qualified). |

## Call 3: T09, complaint from an existing client
**You say:** "I need to speak to someone now. I'm Sheetal Deshpande, my designer is Aryan, 2BHK in Viman Nagar. It's been three months and he hasn't replied in five days."

| Where | Expected |
|---|---|
| Agent | No qualifying questions. Apologises, takes name and location, promises a senior callback within 15 minutes. |
| Telegram (Nikhil = you) | Within about a minute: `🚨 URGENT · complaint from an existing client`, Sheetal + your number, a one-line issue, "callback within 15 minutes (by hh:mm)". |
| Calendar / Email | Nothing. |
| HubSpot | Call: `complaint`, `escalated`. No deal. |
| Dashboard | Complaints escalated +1. The row shows **Escalated**. |

## Call 4: T13, pushes on price twice, then books (no email)
**You say:** "3BHK in Aundh, about 1,100 sq ft. What might it cost?" Later: "Seriously, can't you give me even a rough range?" Then: kitchen, wardrobes in both bedrooms, living room; timeline next spring. Book a slot. Say **no** to email.

| Where | Expected |
|---|---|
| Agent | First ask → "It's best to come to pricing after you meet the designer…". Second ask → the approved line about site, materials and scope, then offers to book. **Says no number, range or per-sq-ft rate.** Still books. Repeats designer, day and time before ending (email declined). |
| Calendar | Event in the **other** designer's calendar (round-robin moved on after call 1), unless they had no free slot. |
| Telegram | Brief to that designer with `Email confirmation: client declined; confirm by phone`. |
| Email | None. |
| HubSpot | Call `new_lead` / `booked` + deal. |
| Dashboard | Meetings booked +1. |

## Call 5: T17, dropped call, then a callback that books
1. Call, say "Hi, I wanted to enquire about…" and **hang up** about 10 seconds in.
2. Call again within 2 minutes: "I called just now and got cut off. I'm Ritu Kapoor from Pimple Saudagar, 3BHK, about 1,050 sq ft, kitchen, wardrobes and living room, done by March." Book a slot, no email.

| Where | Expected |
|---|---|
| First call | HubSpot Call `dropped` / `no_booking`, no deal, no Telegram. Re-delivered webhooks don't create duplicates (same Vaani call id). |
| Second call | Treated as a normal lead: calendar event, designer brief, HubSpot Call `new_lead` / `booked` + deal, on the **same contact** as the first call (matched by phone). |
| Dashboard | Calls +2, booked +1. Both calls appear in Latest calls. |

---

## Sign-off checklist
- [ ] 3 calendar events (calls 1, 4, 5), each in a designer's own calendar, alternating designers when both are free
- [ ] 3 designer briefs on Telegram, 1 urgent complaint alert
- [ ] 1 confirmation email with .ics (call 1 only)
- [ ] 6 HubSpot calls, 3 deals, 5 contacts (calls 5a and 5b share one)
- [ ] Dashboard: 6 calls, 3 booked, 1 complaint, 1 "Outside Pune / PCMC" decline; works on a phone
- [ ] No price figure said by the agent, or shown in any email, brief or dashboard
