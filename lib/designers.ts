/**
 * Designer roster. Lives in Supabase (table `designers`, see supabase/migrations/001_init.sql).
 * Without Supabase configured it falls back to DESIGNERS_JSON for local testing, e.g.
 * DESIGNERS_JSON='[{"code":"ananya","name":"Ananya","calendarId":"ananya@example.com"}]'
 */
import { z } from "zod";
import { db, dbEnabled } from "./db";

const DesignerSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  calendarId: z.string().min(3),
  telegramChatId: z.coerce.number().nullable().optional(),
  active: z.boolean().default(true),
});
export type Designer = z.infer<typeof DesignerSchema>;

type Row = { code: string; name: string; calendar_id: string; telegram_chat_id: number | null; active: boolean };

function fromEnv(): Designer[] {
  const raw = process.env.DESIGNERS_JSON;
  if (!raw) throw new Error("No designers: set SUPABASE_URL (preferred) or DESIGNERS_JSON. See .env.example.");
  return z.array(DesignerSchema).parse(JSON.parse(raw));
}

async function all(): Promise<Designer[]> {
  if (!dbEnabled()) return fromEnv();
  const rows = await db.select<Row>("designers", { order: "sort_order.asc,code.asc" });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    calendarId: r.calendar_id,
    telegramChatId: r.telegram_chat_id,
    active: r.active,
  }));
}

export async function loadDesigners(): Promise<Designer[]> {
  const active = (await all()).filter((d) => d.active);
  if (!active.length) throw new Error("No active designers configured.");
  return active;
}

export async function findDesigner(code: string): Promise<Designer | undefined> {
  return (await all()).find((d) => d.code === code);
}

/** Saves the Telegram chat for a designer. Returns the designer, or null when the code is unknown. */
export async function registerTelegramChat(code: string, chatId: number): Promise<Designer | null> {
  if (!dbEnabled()) throw new Error("Supabase is not configured; cannot save Telegram chat ids.");
  const rows = await db.update<Row>("designers", { code: `eq.${code.toLowerCase()}` }, { telegram_chat_id: chatId });
  const r = rows[0];
  return r ? { code: r.code, name: r.name, calendarId: r.calendar_id, telegramChatId: r.telegram_chat_id, active: r.active } : null;
}
