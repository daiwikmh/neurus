export interface Credentials {
  accountId: string;
  delegateKey: string;
  serverUrl?: string;
}

export function envCredentials(): Credentials | undefined {
  const { MEMWAL_ACCOUNT_ID, MEMWAL_DELEGATE_KEY, MEMWAL_RELAYER_URL } = process.env;
  if (!MEMWAL_ACCOUNT_ID || !MEMWAL_DELEGATE_KEY) return undefined;
  return { accountId: MEMWAL_ACCOUNT_ID, delegateKey: MEMWAL_DELEGATE_KEY, serverUrl: MEMWAL_RELAYER_URL };
}

export interface Tenant {
  id: string;
  root: string;
  credentials?: Credentials;
}

export function localTenant(): Tenant {
  return { id: "local", root: ".", credentials: undefined };
}
