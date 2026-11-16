/** Exponential backoff with jitter for job retries. attempt starts at 1. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = 30_000; // 30s, 1m, 2m, 4m, ... capped at 1h
  const exp = Math.min(base * 2 ** Math.max(0, attempt - 1), 3_600_000);
  const jitter = exp * 0.2 * random();
  return Math.round(exp + jitter);
}

/** Errors worth retrying: rate limits, timeouts, 5xx, network. Validation/auth errors are not. */
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 408 || status === 409 || status === 429 || status >= 500;
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return /timeout|timed out|econnreset|socket|network|fetch failed|rate limit/.test(msg);
}
