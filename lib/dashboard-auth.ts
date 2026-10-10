/** Dashboard passcode → signed cookie. The cookie holds an HMAC of the passcode, never the passcode itself. */
import { createHmac, timingSafeEqual } from "node:crypto";

export const DASH_COOKIE = "aangan_dash";

export function dashboardToken(): string | null {
  const pass = process.env.DASHBOARD_PASSCODE;
  if (!pass) return null;
  return createHmac("sha256", pass).update("aangan-dashboard-v1").digest("base64url");
}

export function passcodeMatches(input: string): boolean {
  const pass = process.env.DASHBOARD_PASSCODE;
  if (!pass) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pass);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tokenValid(token: string | undefined): boolean {
  const expected = dashboardToken();
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
