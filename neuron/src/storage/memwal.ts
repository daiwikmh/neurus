import { MemWal } from "@mysten-incubation/memwal";
import { envCredentials, type Credentials } from "../identity/credentials";
import { withRetry, isNetworkError, RateLimitError } from "../util/retry";

function asRateLimit(e: unknown): RateLimitError | null {
  const m = (e as Error)?.message ?? "";
  if (!/\b429\b|rate.?limit|too many/i.test(m)) return null;
  const secs = m.match(/retry_after_seconds"?\s*:\s*(\d+)/i);
  return new RateLimitError("MemWal account rate limit (500 weighted-requests/hour)", secs ? Number(secs[1]) * 1000 : 300_000);
}

export interface MemwalHit {
  blobId: string;
  text: string;
  distance: number;
}

export class MemwalStore {
  private mw: MemWal;

  constructor(private namespace: string, credentials?: Credentials) {
    const creds = credentials ?? envCredentials();
    if (!creds) throw new Error("No MemWal credentials — pass per-user Credentials or set MEMWAL_ACCOUNT_ID / MEMWAL_DELEGATE_KEY");
    this.mw = MemWal.create({
      key: creds.delegateKey,
      accountId: creds.accountId,
      serverUrl: creds.serverUrl,
      namespace,
    });
  }

  async remember(text: string, timeoutMs = 150_000): Promise<string> {
    try {
      const res = await withRetry(() => this.mw.rememberAndWait(text, this.namespace, { timeoutMs }), {
        label: "memory write (MemWal)",
        attempts: 3,
        shouldRetry: isNetworkError,
      });
      return res.blob_id;
    } catch (e) {
      const rl = asRateLimit(e);
      if (rl) throw rl;
      throw e;
    }
  }

  async rememberAsync(text: string): Promise<void> {
    await this.mw.rememberAsync(text, this.namespace);
  }

  async recall(query: string, limit = 20, maxDistance?: number): Promise<MemwalHit[]> {
    const res = await withRetry(() => this.mw.recall({ query, limit, namespace: this.namespace, maxDistance }), {
      label: "memory store (MemWal)",
      attempts: 3,
      shouldRetry: isNetworkError,
    });
    return res.results.map((r: any) => ({ blobId: r.blob_id, text: r.text, distance: r.distance }));
  }
}
