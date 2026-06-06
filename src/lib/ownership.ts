import { generateDelegateKey, createAccount, addDelegateKey } from "@mysten-incubation/memwal/account";

const PACKAGE_ID = process.env.NEXT_PUBLIC_MEMWAL_PACKAGE_ID ?? "";
const REGISTRY_ID = process.env.NEXT_PUBLIC_MEMWAL_REGISTRY_ID ?? "";
const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK === "mainnet" ? "mainnet" : "testnet") as "testnet" | "mainnet";

export function ownershipConfigured(): boolean {
  return !!PACKAGE_ID && !!REGISTRY_ID;
}

export interface WalletSigner {
  address: string;
  signAndExecuteTransaction: (input: { transaction: unknown }) => Promise<{ digest: string }>;
  signPersonalMessage: (input: { message: Uint8Array }) => Promise<{ signature: string }>;
}

export interface ClaimResult {
  accountId: string;
  delegateKey: string;
}

export async function claimOwnership(signer: WalletSigner, suiClient: unknown): Promise<ClaimResult> {
  if (!ownershipConfigured()) {
    throw new Error("MEMWAL package/registry id not configured — set NEXT_PUBLIC_MEMWAL_PACKAGE_ID / _REGISTRY_ID");
  }
  const delegate = await generateDelegateKey();
  const account = await createAccount({
    packageId: PACKAGE_ID,
    registryId: REGISTRY_ID,
    walletSigner: signer as any,
    suiClient: suiClient as any,
    suiNetwork: NETWORK,
  });
  await addDelegateKey({
    packageId: PACKAGE_ID,
    accountId: account.accountId,
    publicKey: delegate.publicKey,
    label: "Neurus dashboard",
    walletSigner: signer as any,
    suiClient: suiClient as any,
    suiNetwork: NETWORK,
  });
  return { accountId: account.accountId, delegateKey: delegate.privateKey };
}
