// Model choice and cost accounting for AI usage tracking / plan limits.

export const AGENT_MODEL = process.env.AGENT_MODEL?.trim() || "claude-opus-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
export const AGENT_EFFORT: Effort = EFFORTS.includes(process.env.AGENT_EFFORT as Effort)
  ? (process.env.AGENT_EFFORT as Effort)
  : "high";
/** Specialists do narrower work; medium keeps cost down without hurting quality much. */
export const SPECIALIST_EFFORT: Effort = "medium";

// USD per 1M tokens: input, output, cache read, cache write (5-minute TTL = 1.25 × input).
const PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-opus-5": { in: 5, out: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { in: 5, out: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
  "claude-fable-5-2": { in: 8, out: 40, cacheRead: 0.2 },
};
const WEB_SEARCH_USD = 0.01;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export function costUsd(model: string, u: Usage): number {
  // Unknown model ids (e.g. a server-side fallback) are priced like the most expensive known tier,
  // so budgets are never under-counted.
  const p = PRICES[model] ?? { in: 8, out: 40, cacheRead: 0.8 };
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return (
    (u.input_tokens * p.in + u.output_tokens * p.out + cacheRead * p.cacheRead + cacheWrite * p.in * 1.25) / 1_000_000 +
    searches * WEB_SEARCH_USD
  );
}
