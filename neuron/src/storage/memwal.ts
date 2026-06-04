import { MemWal } from "@mysten-incubation/memwal";

export interface MemwalHit {
  blobId: string;
  text: string;
  distance: number;
}

export class MemwalStore {
  private mw: MemWal;

  constructor(private namespace: string) {
    const { MEMWAL_DELEGATE_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_RELAYER_URL } = process.env;
    if (!MEMWAL_DELEGATE_KEY || !MEMWAL_ACCOUNT_ID) {
      throw new Error("Missing MEMWAL_DELEGATE_KEY / MEMWAL_ACCOUNT_ID in environment");
    }
    this.mw = MemWal.create({
      key: MEMWAL_DELEGATE_KEY,
      accountId: MEMWAL_ACCOUNT_ID,
      serverUrl: MEMWAL_RELAYER_URL,
      namespace,
    });
  }

  async remember(text: string, timeoutMs = 150_000): Promise<string> {
    const res = await this.mw.rememberAndWait(text, this.namespace, { timeoutMs });
    return res.blob_id;
  }

  async recall(query: string, limit = 20, maxDistance?: number): Promise<MemwalHit[]> {
    const res = await this.mw.recall({ query, limit, namespace: this.namespace, maxDistance });
    return res.results.map((r: any) => ({ blobId: r.blob_id, text: r.text, distance: r.distance }));
  }
}
