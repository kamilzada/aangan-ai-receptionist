import { timingSafeEqual } from "node:crypto";

/** True when the request carries the shared Vaani secret in the x-vaani-secret header. */
export function hasVaaniSecret(req: Request): boolean {
  const expected = process.env.VAANI_TOOL_SECRET;
  const got = req.headers.get("x-vaani-secret");
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized() {
  return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
}
