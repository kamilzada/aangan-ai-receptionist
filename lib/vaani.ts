/**
 * Vaani custom tools POST the parameters the agent extracted. The exact envelope isn't documented for us yet,
 * so accept the parameters at the top level or nested under a common key. Tighten this once a real request is logged.
 */
export async function readToolParams(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {};
  }
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  for (const key of ["parameters", "params", "args", "arguments", "data"]) {
    const v = b[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return b;
}
