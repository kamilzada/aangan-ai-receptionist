/**
 * Points the Telegram bot at our webhook and prints one registration link per designer.
 * Run: npm run telegram:setup -- https://your-app.vercel.app
 * (Telegram needs a public HTTPS URL; for local testing use a tunnel such as `npx localtunnel --port 3000`.)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const base = process.argv[2]?.replace(/\/$/, "");
  if (!base?.startsWith("https://")) throw new Error("Usage: npm run telegram:setup -- https://your-app.vercel.app");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) throw new Error("Set TELEGRAM_WEBHOOK_SECRET in .env.local first.");

  const { telegramApi } = await import("../lib/telegram");
  const { loadDesigners } = await import("../lib/designers");

  const me = await telegramApi<{ username: string }>("getMe", {});
  await telegramApi("setWebhook", {
    url: `${base}/api/telegram/webhook`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  console.log(`Webhook set: ${base}/api/telegram/webhook (bot @${me.username})\n`);
  console.log("Send each designer their link. Tapping it and pressing Start registers them:");
  for (const d of await loadDesigners()) {
    console.log(`  ${d.name.padEnd(12)} https://t.me/${me.username}?start=${d.code}${d.telegramChatId ? "   (already registered)" : ""}`);
  }
  console.log("\nNikhil: message the bot anything, then open https://api.telegram.org/bot<token>/getUpdates");
  console.log("to read his chat id, or ask him to message @userinfobot. Put it in NIKHIL_TELEGRAM_CHAT_ID.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
