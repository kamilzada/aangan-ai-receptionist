import { registerTelegramChat } from "@/lib/designers";
import { hasTelegramSecret, parseStart, sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Update = { message?: { chat?: { id: number }; text?: string; from?: { first_name?: string } } };

/** Designers register once by sending "/start <designer_code>" (or tapping a t.me/<bot>?start=<code> link). */
export async function POST(req: Request) {
  if (!hasTelegramSecret(req)) return new Response("unauthorized", { status: 401 });

  const update = (await req.json().catch(() => ({}))) as Update;
  const chatId = update.message?.chat?.id;
  const start = parseStart(update.message?.text);
  // Always 200 so Telegram doesn't retry messages we deliberately ignore.
  if (!chatId || !start) return Response.json({ ok: true });

  try {
    if (!start.code) {
      await sendTelegram(chatId, "Hi! To get meeting briefs from Aangan Studio, send /start followed by your designer code, e.g. /start ananya");
      return Response.json({ ok: true });
    }
    const designer = await registerTelegramChat(start.code, chatId);
    await sendTelegram(
      chatId,
      designer
        ? `Thanks ${designer.name}, you're registered. New meetings the AI receptionist books for you will arrive here.`
        : `Sorry, "${start.code}" isn't a designer code I know. Please check it with the studio.`,
    );
  } catch (err) {
    console.error("[telegram webhook]", err);
  }
  return Response.json({ ok: true });
}
