/**
 * Google Calendar via a service account. Each designer shares their calendar with
 * GOOGLE_SERVICE_ACCOUNT_EMAIL ("Make changes to events").
 * Note: without Workspace domain-wide delegation a service account cannot add attendees,
 * so events carry the client's details in the description and the client gets an .ics by email.
 */
import { JWT } from "google-auth-library";
import type { Interval } from "./slots";

const API = "https://www.googleapis.com/calendar/v3";

let client: JWT | null = null;
function auth(): JWT {
  if (client) return client;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account env vars are missing.");
  client = new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/calendar"] });
  return client;
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
