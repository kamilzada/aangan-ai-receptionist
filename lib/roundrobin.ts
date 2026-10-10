/**
 * Round-robin order of designers. The store remembers who was booked last; the next call starts
 * with the designer after them. Supabase-backed (app_state.roundrobin_last) when configured,
 * otherwise in-memory (resets on cold start, fine for local testing).
 */
import { db, dbEnabled } from "./db";

export interface RoundRobinStore {
  getLastCode(): Promise<string | null>;
  setLastCode(code: string): Promise<void>;
}

let memoryLast: string | null = null;
export const memoryStore: RoundRobinStore = {
  async getLastCode() {
    return memoryLast;
  },
  async setLastCode(code) {
    memoryLast = code;
  },
};

const KEY = "roundrobin_last";
export const supabaseStore: RoundRobinStore = {
  async getLastCode() {
    const rows = await db.select<{ value: string | null }>("app_state", { key: `eq.${KEY}` });
    return rows[0]?.value ?? null;
  },
  async setLastCode(code) {
    await db.upsert("app_state", { key: KEY, value: code, updated_at: new Date().toISOString() });
  },
};

export function rotate<T extends { code: string }>(items: T[], lastCode: string | null): T[] {
  const i = lastCode ? items.findIndex((d) => d.code === lastCode) : -1;
  if (i < 0) return items;
  return [...items.slice(i + 1), ...items.slice(0, i + 1)];
}

export function getStore(): RoundRobinStore {
  return dbEnabled() ? supabaseStore : memoryStore;
}
