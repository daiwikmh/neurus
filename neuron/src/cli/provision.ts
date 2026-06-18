import { createAccount, addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { getFaucetHost, requestSuiFromFaucetV2, FaucetRateLimitError } from "@mysten/sui/faucet";

// Public on-chain object IDs for Walrus Memory on Sui testnet — safe to bundle as defaults.
const PACKAGE_ID = process.env.MEMWAL_PACKAGE_ID ?? "0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6";
const REGISTRY_ID = process.env.MEMWAL_REGISTRY_ID ?? "0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437";
const RELAYER = process.env.MEMWAL_RELAYER_URL ?? "https://relayer.memory.walrus.xyz";
const NETWORK = "testnet" as const;

// createAccount needs gas; a fresh account-creation tx is comfortably under this.
const MIN_GAS = 50_000_000n; // 0.05 SUI

export interface ProvisionResult {
  accountId: string;
  delegateKey: string;
  serverUrl: string;
}

function client(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
}

export async function balanceOf(address: string): Promise<bigint> {
  const b = await client().getBalance({ owner: address });
  return BigInt(b.totalBalance);
}

export async function requestFaucet(address: string): Promise<void> {
  await requestSuiFromFaucetV2({ host: getFaucetHost(NETWORK), recipient: address });
}

export const isRateLimit = (e: unknown): boolean => e instanceof FaucetRateLimitError;

// Mints a Walrus Memory account owned by the agent's own wallet, generates a delegate
// key, authorizes it on the account, and returns credentials for ~/.neurus/mcp.json.
// The wallet must already hold a little testnet SUI (handle funding before calling).
export async function provisionMemwal(suiPrivateKey: string): Promise<ProvisionResult> {
  const delegate = await generateDelegateKey();
  const { accountId } = await createAccount({ packageId: PACKAGE_ID, registryId: REGISTRY_ID, suiPrivateKey, suiNetwork: NETWORK });
  await addDelegateKey({ packageId: PACKAGE_ID, accountId, publicKey: delegate.publicKey, label: "Neurus CLI", suiPrivateKey, suiNetwork: NETWORK });
  return { accountId, delegateKey: delegate.privateKey, serverUrl: RELAYER };
}

export { MIN_GAS };
