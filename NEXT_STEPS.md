# Next steps

All seven phases are coded and tested locally (`npm test`: 36 tests, `npm run typecheck`, `npm run build`).
What's left needs your accounts and keys. Nothing here costs money.

1. **Keys and services**: follow `docs/SETUP.md` (Gemini → Google Calendar → Supabase → Telegram → HubSpot → Resend).
2. **Check the classifier**: `npm run replay` (target 18+/20 September calls).
3. **Check booking locally**: `npm run dev`, then `./scripts/test-endpoints.sh`. An event should appear in a designer calendar.
4. **Deploy**: `docs/SETUP.md` §8 (GitHub → Vercel → env vars), then `npm run telegram:setup -- https://<app>`.
5. **Connect Vaani**: `docs/VAANI_SETUP.md`.
6. **Five test calls**: `docs/TEST_PLAN.md`.

Useful commands:
```
npm run dev                                   # local server on :3000
npm run simulate-call -- T09 [base_url]       # push a September transcript through the post-call pipeline
npm run hubspot:setup                         # create the HubSpot custom properties
npm run telegram:setup -- https://<app>       # set the bot webhook, print designer links
```

The dashboard shows clearly-labelled sample data until `HUBSPOT_PRIVATE_APP_TOKEN` is set.
