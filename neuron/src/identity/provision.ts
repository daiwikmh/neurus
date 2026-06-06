import { createAccount, addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import type { Credentials } from "./credentials";

const RELAYER = process.env.MEMWAL_RELAYER_URL ?? process.env.NEURUS_RELAYER_URL ?? "https://relayer-staging.memory.walrus.xyz";

// Mints a per-user Walrus Memory account on Sui via the MemWal SDK, signed by the
// server's Sui key (the app pays gas; storage is relayer-sponsored). A fresh delegate
// key is generated and authorized on the account, then stored sealed in the vault.
export async function provisionCredentials(): Promise<Credentials> {
  const packageId = process.env.MEMWAL_PACKAGE_ID;
  const registryId = process.env.MEMWAL_REGISTRY_ID;
  const suiPrivateKey = process.env.SUI_PRIVATE_KEY;
  const suiNetwork = process.env.SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";

  if (!packageId || !registryId) {
    throw new Error("provisioning needs MEMWAL_PACKAGE_ID and MEMWAL_REGISTRY_ID in the engine env");
  }
  if (!suiPrivateKey) {
    throw new Error("provisioning needs SUI_PRIVATE_KEY — a funded suiprivkey1... key the server signs account creation with");
  }

  const delegate = await generateDelegateKey();
  const { accountId } = await createAccount({ packageId, registryId, suiPrivateKey, suiNetwork });
  await addDelegateKey({ packageId, accountId, publicKey: delegate.publicKey, label: "Neurus", suiPrivateKey, suiNetwork });

  return { accountId, delegateKey: delegate.privateKey, serverUrl: RELAYER };
}
