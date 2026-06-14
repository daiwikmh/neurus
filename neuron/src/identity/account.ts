import { delegateKeyToPublicKey } from "@mysten-incubation/memwal";
import { Vault } from "./vault";
import { provisionCredentials } from "./provision";
import type { Credentials } from "./credentials";

export interface AccountStatus {
  linked: boolean;
  accountId?: string;
  owned: boolean;
}

export class AccountManager {
  constructor(private vault = new Vault()) {}

  async status(tenantId: string): Promise<AccountStatus> {
    const creds = await this.vault.get(tenantId);
    const owned = !!creds?.accountId;
    const linked = owned && !!creds?.delegateKey;
    return { linked, accountId: creds?.accountId, owned };
  }

  async link(tenantId: string, creds: Credentials): Promise<AccountStatus> {
    if (!creds.accountId || !creds.delegateKey) {
      throw new Error("link requires both accountId and delegateKey");
    }
    await this.vault.put(tenantId, creds);
    return { linked: true, accountId: creds.accountId, owned: true };
  }

  async provisionAndLink(tenantId: string): Promise<AccountStatus> {
    const existing = await this.vault.get(tenantId);
    if (existing) return { linked: true, accountId: existing.accountId, owned: true };
    const creds = await provisionCredentials();
    await this.vault.put(tenantId, creds);
    return { linked: true, accountId: creds.accountId, owned: true };
  }

  async unlink(tenantId: string): Promise<{ unlinked: boolean; accountId?: string }> {
    const creds = await this.vault.get(tenantId);
    if (!creds) return { unlinked: false };
    await this.vault.put(tenantId, { accountId: creds.accountId, delegateKey: "" });
    return { unlinked: true, accountId: creds.accountId };
  }

  async getDelegatePublicKey(tenantId: string): Promise<string> {
    const creds = await this.vault.get(tenantId);
    if (!creds?.delegateKey) throw new Error("no delegate key linked");
    const bytes = await delegateKeyToPublicKey(creds.delegateKey);
    return Buffer.from(bytes).toString("hex");
  }

  async relink(tenantId: string, delegateKey: string): Promise<AccountStatus> {
    const creds = await this.vault.get(tenantId);
    if (!creds?.accountId) throw new Error("no account to relink — claim ownership first");
    await this.vault.put(tenantId, { ...creds, delegateKey });
    return { linked: true, accountId: creds.accountId, owned: true };
  }
}
