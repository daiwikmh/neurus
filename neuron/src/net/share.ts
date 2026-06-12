import { putBlobInfo, getBlob } from "../storage/walrus";
import { sealForShare, inspectSealed, unsealForReader } from "../access/seal-walrus";
import { Neurus } from "../index";
import type { Tenant } from "../identity/credentials";

// Cross-user dataset sharing: seal a set's snapshot under an on-chain Share (allowlist) identity
// and store the ciphertext on Walrus. Only addresses the owner grants on-chain can decrypt it.

export interface SealedDatasetRef {
  blobId: string;
  shareId: string;
  identity: string;
  packageId: string;
  neurons: number;
}

export async function publishSealedDataset(set: string, shareId: string, tenant?: Tenant): Promise<SealedDatasetRef> {
  const nx = await Neurus.open(set, { tenant });
  const neurons = await nx.neurons();
  const s = await sealForShare(JSON.stringify(neurons), shareId);
  const info = await putBlobInfo(Buffer.from(s.sealed, "base64"));
  return { blobId: info.blobId, shareId, identity: s.identity, packageId: s.packageId, neurons: neurons.length };
}

export async function fetchSealedDataset(blobId: string): Promise<{ sealedB64: string; packageId: string; threshold: number; services: number }> {
  const bytes = await getBlob(blobId);
  const sealedB64 = Buffer.from(bytes).toString("base64");
  const meta = inspectSealed(sealedB64);
  return { sealedB64, packageId: meta.packageId, threshold: meta.threshold, services: meta.services };
}

/// Recipient side: fetch the sealed blob from Walrus and decrypt it after the on-chain allowlist
/// check (needs neurus_share deployed + an allowlisted signer). Returns the imported neuron count.
export async function importSealedDataset(
  blobId: string,
  intoSet: string,
  opts: { shareId: string; address: string; signer: { signPersonalMessage(m: Uint8Array): Promise<{ signature: string }> }; tenant?: Tenant },
): Promise<number> {
  const { sealedB64 } = await fetchSealedDataset(blobId);
  const plaintext = await unsealForReader(sealedB64, { shareId: opts.shareId, address: opts.address, signer: opts.signer });
  const neurons = JSON.parse(plaintext) as { id: string }[];
  const nx = await Neurus.open(intoSet, { tenant: opts.tenant });
  const mem = nx.memory;
  for (const n of neurons) await mem.remember(n as never);
  return neurons.length;
}
