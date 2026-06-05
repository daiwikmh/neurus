import { MemWal } from "@mysten-incubation/memwal";
import { envCredentials, type Credentials } from "../identity/credentials";

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
    const res = await this.mw.rememberAndWait(text, this.namespace, { timeoutMs });
    return res.blob_id;
  }

  async recall(query: string, limit = 20, maxDistance?: number): Promise<MemwalHit[]> {
    const res = await this.mw.recall({ query, limit, namespace: this.namespace, maxDistance });
    return res.results.map((r: any) => ({ blobId: r.blob_id, text: r.text, distance: r.distance }));
  }
}
