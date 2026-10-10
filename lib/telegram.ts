/** Telegram Bot API over fetch. Messages are plain text so caller-supplied details can't break formatting. */
import { timingSafeEqual } from "node:crypto";

export function telegramEnabled(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json.result as T;
}

export async function sendTelegram(chatId: number | string, text: string): Promise<void> {
  await telegramApi("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

/** Telegram echoes the secret we set with setWebhook in this header on every update. */
export function hasTelegramSecret(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "/start ananya" or "/start@AanganBot ananya" → "ananya"; null if it isn't a /start command. */
export function parseStart(text: string | undefined): { code: string | null } | null {
  const m = text?.trim().match(/^\/start(?:@\w+)?(?:\s+(\S+))?/i);
  if (!m) return null;
  return { code: m[1]?.toLowerCase() ?? null };
}
