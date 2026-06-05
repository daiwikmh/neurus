export class RetryableError extends Error {
  constructor(message: string, public retryAfterMs?: number) {
    super(message);
    this.name = "RetryableError";
  }
}

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  deadlineMs?: number;
  label?: string;
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

export function isNetworkError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  const msg = (e?.message ?? "").toLowerCase();
  const code = e?.cause?.code ?? "";
  return (
    e?.name === "AbortError" ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("socket") ||
    /econnreset|etimedout|econnrefused|enotfound|eai_again/.test(`${msg} ${code}`.toLowerCase())
  );
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseMs = 400, maxMs = 8_000, deadlineMs = 30_000, label = "operation", shouldRetry = () => true, onRetry } = opts;
  const start = Date.now();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !shouldRetry(err)) break;
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const jittered = backoff * (0.5 + Math.random() * 0.5);
      const explicit = err instanceof RetryableError ? err.retryAfterMs ?? 0 : 0;
      const delay = Math.max(explicit, jittered);
      if (Date.now() - start + delay > deadlineMs) break;
      onRetry?.(err, attempt, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`${label} failed after retries: ${(lastErr as Error)?.message ?? lastErr}`);
}
