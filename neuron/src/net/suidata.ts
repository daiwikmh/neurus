import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

let client: SuiJsonRpcClient | undefined;

export function suiData(): SuiJsonRpcClient {
  if (!client) {
    const network = (process.env.SUI_DATA_NETWORK as "mainnet" | "testnet") ?? "mainnet";
    client = new SuiJsonRpcClient({ url: process.env.SUI_DATA_RPC_URL ?? getJsonRpcFullnodeUrl(network), network });
  }
  return client;
}
