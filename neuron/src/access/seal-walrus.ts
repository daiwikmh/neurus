import { SealClient, SessionKey, EncryptedObject } from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { randomBytes } from "node:crypto";

// Real Mysten Seal: threshold IBE + on-chain access policy (neurus_share::share::seal_approve).
// Encryption runs against live testnet key servers (no deploy/gas). Cross-user decryption needs
// the neurus_share package deployed (NEURUS_SEAL_PACKAGE) + a signer on the allowlist.

// Env read LAZILY (not at module load) so it works regardless of when .env is loaded relative
// to imports. Open decentralized (committee) testnet key server + aggregator serves arbitrary packages.
const keyServers = () =>
  (process.env.NEURUS_SEAL_KEYSERVERS ?? "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98").split(",").map((s) => s.trim()).filter(Boolean);
const aggregator = () => process.env.NEURUS_SEAL_AGGREGATOR ?? "https://seal-aggregator-testnet.mystenlabs.com";
// Until neurus_share is deployed, default to the public Seal demo package so encryption is real.
const pkgId = () => process.env.NEURUS_SEAL_PACKAGE ?? "0xc5ce2742cac46421b62028557f1d7aea8a4c50f651379a79afdf12cd88628807";
const threshold = () => Number(process.env.NEURUS_SEAL_THRESHOLD ?? keyServers().length);

let suiClient: SuiJsonRpcClient | undefined;
function sui(): SuiJsonRpcClient {
  if (!suiClient) {
    const network = (process.env.SUI_NETWORK as "mainnet" | "testnet") ?? "testnet";
    suiClient = new SuiJsonRpcClient({ url: process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl(network), network });
  }
  return suiClient;
}

let sealClient: SealClient | undefined;
function seal(): SealClient {
  if (!sealClient) {
    sealClient = new SealClient({
      suiClient: sui() as never,
      serverConfigs: keyServers().map((objectId) => ({ objectId, weight: 1, aggregatorUrl: aggregator() })),
      verifyKeyServers: false,
    });
  }
  return sealClient;
}

const strip0x = (s: string) => (s.startsWith("0x") ? s.slice(2) : s);

/// Identity = [shareId bytes][random nonce]; seal_approve checks the shareId is its prefix.
export function sealIdentity(shareId: string): string {
  return strip0x(shareId) + randomBytes(8).toString("hex");
}

export interface SealedSnapshot {
  sealed: string; // base64 EncryptedObject for Walrus
  identity: string;
  backupKey: string; // base64 symmetric key — owner-only fallback, never share
  packageId: string;
  shareId: string;
}

export async function sealForShare(plaintext: string, shareId: string): Promise<SealedSnapshot> {
  const identity = sealIdentity(shareId);
  const { encryptedObject, key } = await seal().encrypt({
    threshold: threshold(),
    packageId: pkgId(),
    id: identity,
    data: new TextEncoder().encode(plaintext),
  });
  return {
    sealed: Buffer.from(encryptedObject).toString("base64"),
    identity,
    backupKey: Buffer.from(key).toString("base64"),
    packageId: pkgId(),
    shareId,
  };
}

/// Parse a sealed blob's metadata without decrypting (verification / inspection).
export function inspectSealed(sealedB64: string): { packageId: string; threshold: number; id: string; services: number } {
  const obj = EncryptedObject.parse(new Uint8Array(Buffer.from(sealedB64, "base64")));
  return { packageId: obj.packageId, threshold: obj.threshold, id: obj.id, services: obj.services.length };
}

/// Build the PTB the recipient submits so key servers can evaluate seal_approve.
export function approveTransaction(shareId: string, identity: string, packageId = pkgId()): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::share::seal_approve`,
    arguments: [tx.pure.vector("u8", Array.from(Buffer.from(identity, "hex"))), tx.object(shareId)],
  });
  return tx;
}

/// Cross-user decryption. Requires neurus_share deployed + `signer` on the allowlist.
/// Returns plaintext if the on-chain policy approves (key servers run seal_approve).
export async function unsealForReader(
  sealedB64: string,
  opts: { shareId: string; address: string; signer: { signPersonalMessage(m: Uint8Array): Promise<{ signature: string }> } },
): Promise<string> {
  const sealed = new Uint8Array(Buffer.from(sealedB64, "base64"));
  const identity = EncryptedObject.parse(sealed).id;

  const sessionKey = await SessionKey.create({ address: opts.address, packageId: pkgId(), ttlMin: 10, suiClient: sui() as never });
  const { signature } = await opts.signer.signPersonalMessage(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signature);

  const tx = approveTransaction(opts.shareId, identity);
  const txBytes = await tx.build({ client: sui() as never, onlyTransactionKind: true });
  const decrypted = await seal().decrypt({ data: sealed, sessionKey, txBytes });
  return new TextDecoder().decode(decrypted);
}
