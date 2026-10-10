/**
 * Designer roster. Phase 2: read from DESIGNERS_JSON env, e.g.
 * DESIGNERS_JSON='[{"code":"ananya","name":"Ananya","calendarId":"ananya@example.com"}]'
 * Later phases move this to Supabase (with Telegram chat ids).
 */
import { z } from "zod";

const DesignerSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  calendarId: z.string().min(3),
  active: z.boolean().default(true),
});
export type Designer = z.infer<typeof DesignerSchema>;

export function loadDesigners(): Designer[] {
  const raw = process.env.DESIGNERS_JSON;
  if (!raw) throw new Error("DESIGNERS_JSON is not set. See .env.example.");
  const parsed = z.array(DesignerSchema).parse(JSON.parse(raw));
  const active = parsed.filter((d) => d.active);
  if (!active.length) throw new Error("DESIGNERS_JSON has no active designers.");
  return active;
}

export function findDesigner(code: string): Designer | undefined {
  return loadDesigners().find((d) => d.code === code);
}
