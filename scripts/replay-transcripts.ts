/**
 * Replays the 20 September phone transcripts through Gemini Flash and compares with tests/expected-outcomes.json.
 * Run: npm run replay   (needs GEMINI_API_KEY in .env.local)
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyTranscript } from "../lib/classify";

loadEnv({ path: ".env.local" });

const root = path.resolve(__dirname, "..");
const text = readFileSync(path.join(root, "context/enquiries-sept-2026.txt"), "utf8");
const expected: Record<string, { call_type: string; outcome: string; decline_reason?: string }> = JSON.parse(
  readFileSync(path.join(root, "tests/expected-outcomes.json"), "utf8"),
);

export function splitPhoneCalls(raw: string): Record<string, string> {
  const section = raw.split(/SECTION 2/)[0];
  const parts = section.split(/(?=^\s*T\d{2} · )/m);
  const calls: Record<string, string> = {};
  for (const p of parts) {
    const m = p.match(/^\s*(T\d{2}) · /);
    if (m) calls[m[1]] = p.trim();
  }
  return calls;
}

async function main() {
  const calls = splitPhoneCalls(text);
  const ids = Object.keys(calls).sort();
  console.log(`Found ${ids.length} phone transcripts.\n`);
  let matches = 0;
  const rows: string[] = [];
  // Free tier allows 5 requests/minute; space calls out (REPLAY_DELAY_MS=0 on a paid key).
  const gap = Number(process.env.REPLAY_DELAY_MS ?? 12_500);
  const only = process.argv.slice(2).map((a) => a.toUpperCase());
  for (const [n, id] of ids.filter((i) => !only.length || only.includes(i)).entries()) {
    if (n > 0 && gap > 0) await new Promise((r) => setTimeout(r, gap));
    const exp = expected[id];
    try {
      const got = await classifyTranscript(calls[id]);
      const reasonOk = !exp?.decline_reason || exp.decline_reason === got.decline_reason;
      const ok = !!exp && exp.call_type === got.call_type && exp.outcome === got.outcome && reasonOk;
      if (ok) matches++;
      rows.push(
        `${ok ? "PASS" : "MISS"}  ${id}  expected ${exp?.call_type}/${exp?.outcome}${exp?.decline_reason ? "/" + exp.decline_reason : ""}` +
          `  got ${got.call_type}/${got.outcome}${got.decline_reason !== "none" ? "/" + got.decline_reason : ""}` +
          (ok ? "" : `\n      ${got.summary}`),
      );
    } catch (e) {
      rows.push(`ERROR ${id}  ${(e as Error).message.slice(0, 160)}`);
    }
    console.log(rows[rows.length - 1]);
  }
  console.log(`\n${matches}/${only.length || ids.length} match the expected outcome (target: 18+).`);
}

if (require.main === module) main();
