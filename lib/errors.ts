/** Turns unexpected failures into a reply the voice agent can still say, and logs the detail server-side. */
export function toolFailure(where: string, err: unknown) {
  console.error(`[${where}]`, err);
  return Response.json(
    {
      ok: false,
      reason: "system_error",
      say: "I'm having trouble reaching the calendar right now. Let me take your details, and the team will call you back to fix a time today.",
    },
    { status: 200 },
  );
}
