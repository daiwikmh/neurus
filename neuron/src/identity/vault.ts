import { readFile, writeFile } from "node:fs/promises";
import { seal, unseal, isSealed } from "../access/seal";
import { kvEnabled, kvGet, kvSet } from "../storage/kv";
import type { Credentials } from "./credentials";

const KV_KEY = process.env.NEURUS_VAULT_KV ?? "neurus:vault";

export class Vault {
  constructor(
    private path = process.env.NEURUS_VAULT ?? ".neurus-vault.json",
    private masterKey = process.env.NEURUS_VAULT_KEY ?? process.env.NEURON_VAULT_KEY,
  ) {}

  private async readBlob(): Promise<string | null> {
    if (kvEnabled()) return kvGet(KV_KEY);
    try {
      return await readFile(this.path, "utf8");
    } catch {
      return null;
    }
  }

  private async writeBlob(body: string): Promise<void> {
    if (kvEnabled()) {
      await kvSet(KV_KEY, body);
      return;
    }
    await writeFile(this.path, body);
  }

  private async all(): Promise<Record<string, Credentials>> {
    let body = await this.readBlob();
    if (body === null) return {};
    if (isSealed(body)) {
      if (!this.masterKey) throw new Error("vault is sealed but NEURUS_VAULT_KEY is not set");
      body = unseal(body, this.masterKey);
    }
    return JSON.parse(body);
  }

  private async write(all: Record<string, Credentials>): Promise<void> {
    if (!this.masterKey) {
      throw new Error("NEURUS_VAULT_KEY is required to write the credential vault — refusing to store delegate keys in plaintext");
    }
    await this.writeBlob(seal(JSON.stringify(all, null, 2), this.masterKey));
  }

  async get(userId: string): Promise<Credentials | undefined> {
    return (await this.all())[userId];
  }

  async put(userId: string, creds: Credentials): Promise<void> {
    const all = await this.all();
    all[userId] = creds;
    await this.write(all);
  }

  async remove(userId: string): Promise<void> {
    const all = await this.all();
    delete all[userId];
    await this.write(all);
  }

  async has(userId: string): Promise<boolean> {
    return userId in (await this.all());
  }
}
