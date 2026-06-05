import { withRetry, RetryableError, isNetworkError } from "../util/retry";

const GATEWAYS: Record<string, string> = {
  mainnet: "https://sui-mainnet.gateway.tatum.io",
  testnet: "https://sui-testnet.gateway.tatum.io",
  devnet: "https://sui-devnet.gateway.tatum.io",
};

export function suiNetwork(): string {
  return process.env.SUI_NETWORK ?? "testnet";
}

function endpoint(): { url: string; apiKey?: string } {
  const net = suiNetwork();
  const url = process.env.SUI_RPC_URL || GATEWAYS[net] || GATEWAYS.testnet;
  const apiKey = net === "mainnet" ? process.env.MAINNET_API_KEY : process.env.TESTNET_API_KEY;
  return { url, apiKey };
}

export async function suiRpc<T = any>(method: string, params: unknown[]): Promise<T> {
  const { url, apiKey } = endpoint();
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 429 || res.status >= 500) throw new RetryableError(`Sui RPC HTTP ${res.status}: ${body}`);
        throw new Error(`Sui RPC HTTP ${res.status}: ${body}`);
      }
      const json: any = await res.json();
      if (json.error) throw new Error(`Sui RPC ${method}: ${JSON.stringify(json.error)}`);
      return json.result as T;
    },
    { label: "Sui RPC (Tatum)", attempts: 3, shouldRetry: (e) => e instanceof RetryableError || isNetworkError(e) },
  );
}

export async function getObjectFields(objectId: string): Promise<any | undefined> {
  const result: any = await suiRpc("sui_getObject", [objectId, { showType: true, showOwner: true, showContent: true }]);
  return result?.data?.content?.fields;
}

export async function getObjectOwner(objectId: string): Promise<any | undefined> {
  const result: any = await suiRpc("sui_getObject", [objectId, { showOwner: true }]);
  return result?.data?.owner;
}

export async function getDynamicFieldObject(parentId: string, name: { type: string; value: unknown }): Promise<any | undefined> {
  const result: any = await suiRpc("suix_getDynamicFieldObject", [parentId, name]);
  return result?.data?.content?.fields;
}
