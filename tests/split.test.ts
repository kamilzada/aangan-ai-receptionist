import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("transcript splitting", () => {
  it("finds T01–T20", async () => {
    process.env.GEMINI_API_KEY ??= "test";
    const { splitPhoneCalls } = await import("../scripts/replay-transcripts");
    const raw = readFileSync(path.resolve(__dirname, "../context/enquiries-sept-2026.txt"), "utf8");
    const calls = splitPhoneCalls(raw);
    expect(Object.keys(calls).sort()).toEqual(Array.from({ length: 20 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`));
    expect(calls.T09).toContain("Sheetal");
    expect(calls.T20).not.toContain("WhatsApp");
  });
});
