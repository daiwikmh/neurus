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
    return { linked: !!creds, accountId: creds?.accountId, owned: !!creds };
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

  async unlink(tenantId: string): Promise<{ unlinked: boolean }> {
    if (!(await this.vault.has(tenantId))) return { unlinked: false };
    await this.vault.remove(tenantId);
    return { unlinked: true };
  }
}
