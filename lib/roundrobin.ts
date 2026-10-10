/**
 * Round-robin order of designers. The store remembers who was booked last; the next call starts
 * with the designer after them. Phase 2 uses an in-memory store (resets on cold start, fine for testing);
 * swap in a Supabase-backed store in a later phase without touching callers.
 */
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

export function rotate<T extends { code: string }>(items: T[], lastCode: string | null): T[] {
  const i = lastCode ? items.findIndex((d) => d.code === lastCode) : -1;
  if (i < 0) return items;
  return [...items.slice(i + 1), ...items.slice(0, i + 1)];
}

export function getStore(): RoundRobinStore {
  return memoryStore;
}
