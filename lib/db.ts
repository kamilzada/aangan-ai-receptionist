/**
 * Tiny Supabase (PostgREST) client over fetch, server-side only, using the service role key.
 * When SUPABASE_URL is not set the app falls back to DESIGNERS_JSON and in-memory state, so local testing still works.
 */

export function dbEnabled(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

type Query = Record<string, string>;

async function rest<T>(
  method: "GET" | "POST" | "PATCH",
  table: string,
  opts: { query?: Query; body?: unknown; prefer?: string } = {},
): Promise<{ status: number; data: T }> {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const qs = new URLSearchParams(opts.query ?? {}).toString();
  const res = await fetch(`${base}/rest/v1/${table}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok && res.status !== 409) {
    throw new Error(`Supabase ${method} ${table} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

export const db = {
  async select<T>(table: string, query: Query = {}): Promise<T[]> {
    return (await rest<T[]>("GET", table, { query: { select: "*", ...query } })).data;
  },
  /** Insert; returns false instead of throwing when the primary key already exists. */
  async insert(table: string, row: Record<string, unknown>): Promise<boolean> {
    const { status } = await rest("POST", table, { body: row, prefer: "return=minimal" });
    return status !== 409;
  },
  async upsert(table: string, row: Record<string, unknown>): Promise<void> {
    await rest("POST", table, { body: row, prefer: "resolution=merge-duplicates,return=minimal" });
  },
  /** PATCH rows matching `filter` (PostgREST syntax, e.g. { code: "eq.ananya" }); returns the updated rows. */
  async update<T>(table: string, filter: Query, patch: Record<string, unknown>): Promise<T[]> {
    return (await rest<T[]>("PATCH", table, { query: filter, body: patch, prefer: "return=representation" })).data;
  },
};
