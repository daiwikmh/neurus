import type { Credentials } from "./credentials";

const MEMORY_ENDPOINT = process.env.NEURUS_MEMORY_ENDPOINT ?? "https://staging.memory.walrus.xyz";
const RELAYER = process.env.NEURUS_RELAYER_URL ?? "https://relayer-staging.memory.walrus.xyz";

export async function provisionCredentials(): Promise<Credentials> {
  const res = await fetch(`${MEMORY_ENDPOINT}/v1/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(
      `provisioning not available (HTTP ${res.status}). The Walrus Memory hosted endpoint at ${MEMORY_ENDPOINT} ` +
        `mints {accountId, delegateKey} per client; confirm its exact path/shape, or provision out-of-band and store via Vault.put.`,
    );
  }
  const data: any = await res.json();
  const accountId = data.accountId ?? data.account_id;
  const delegateKey = data.delegateKey ?? data.delegate_key ?? data.key;
  if (!accountId || !delegateKey) throw new Error(`provisioning response missing accountId/delegateKey: ${JSON.stringify(data)}`);
  return { accountId, delegateKey, serverUrl: RELAYER };
}
