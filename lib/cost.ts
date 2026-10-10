/**
 * AI cost per call in INR = voice minutes (Vaani) + classification tokens (Gemini).
 * Vaani doesn't send a cost in the webhook, so its per-minute rate is configured (VAANI_COST_PER_MIN_INR).
 */
export type TokenUsage = { input: number; output: number };

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : fallback;
};

export function aiCostInr(opts: { durationSec: number; usage?: TokenUsage; vaaniCostInr?: number | null }): number {
  const usdInr = num(process.env.USD_INR, 88);
  const voice = opts.vaaniCostInr ?? (opts.durationSec / 60) * num(process.env.VAANI_COST_PER_MIN_INR, 6);
  // Gemini 2.5 Flash list price, USD per million tokens (input includes the prompt).
  const inPerM = num(process.env.GEMINI_USD_PER_M_INPUT, 0.3);
  const outPerM = num(process.env.GEMINI_USD_PER_M_OUTPUT, 2.5);
  const llm = opts.usage ? ((opts.usage.input * inPerM + opts.usage.output * outPerM) / 1_000_000) * usdInr : 0;
  return Math.round((voice + llm) * 100) / 100;
}
