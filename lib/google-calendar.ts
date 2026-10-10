/**
 * Google Calendar access, two ways:
 * - OAuth (default for MESA, whose Workspace blocks service-account keys): one Google account signs in once
 *   (`npm run google:auth`) and we keep its refresh token. Designer calendars are owned by, or shared with, that account.
 * - Service account: each designer shares their calendar with GOOGLE_SERVICE_ACCOUNT_EMAIL ("Make changes to events").
 * Either way events carry the client's details in the description; the client gets an .ics by email.
 */
import { JWT, OAuth2Client } from "google-auth-library";
import type { Interval } from "./slots";

const API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

let client: JWT | OAuth2Client | null = null;
function auth(): JWT | OAuth2Client {
  if (client) return client;
  const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret, GOOGLE_OAUTH_REFRESH_TOKEN: refresh } = process.env;
  if (id && secret && refresh) {
    const oauth = new OAuth2Client({ clientId: id, clientSecret: secret });
    oauth.setCredentials({ refresh_token: refresh });
    return (client = oauth);
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google Calendar is not configured: run `npm run google:auth` (or set a service account).");
  return (client = new JWT({ email, key, scopes: [CALENDAR_SCOPE] }));
}

async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const { token } = await auth().getAccessToken();
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar ${init.method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Busy intervals per calendar id. Calendars Google can't read are reported in `errors`. */
export async function freeBusy(
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<{ busy: Record<string, Interval[]>; errors: Record<string, string> }> {
  type Resp = { calendars: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason: string }[] }> };
  const data = await call<Resp>("/freeBusy", {
    method: "POST",
    body: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: "Asia/Kolkata",
      items: calendarIds.map((id) => ({ id })),
    },
  });
  const busy: Record<string, Interval[]> = {};
  const errors: Record<string, string> = {};
  for (const id of calendarIds) {
    const c = data.calendars[id];
    if (!c || c.errors?.length) {
      errors[id] = c?.errors?.map((e) => e.reason).join(", ") ?? "not returned";
      continue;
    }
    busy[id] = (c.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }
  return { busy, errors };
}

export async function insertEvent(
  calendarId: string,
  event: {
    summary: string;
    description: string;
    location: string;
    start: Date;
    end: Date;
    privateProps?: Record<string, string>;
  },
): Promise<{ id: string; htmlLink: string }> {
  return call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: event.start.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: event.end.toISOString(), timeZone: "Asia/Kolkata" },
      extendedProperties: { private: event.privateProps ?? {} },
      reminders: { useDefault: true },
    },
  });
}

/** Creates a secondary calendar owned by the signed-in account (used by scripts/google-auth.ts). */
export async function createCalendar(summary: string): Promise<{ id: string }> {
  return call("/calendars", { method: "POST", body: { summary, timeZone: "Asia/Kolkata" } });
}
