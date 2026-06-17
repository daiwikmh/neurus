import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

// On-chain ops for the neurus_share allowlist. Active only when both a funded testnet key
// (SUI_PRIVATE_KEY) and the deployed package (NEURUS_SEAL_PACKAGE) are configured.

const DEMO_PKG = "0xc5ce2742cac46421b62028557f1d7aea8a4c50f651379a79afdf12cd88628807";

function secretKey(): string | undefined {
  return process.env.SUI_TESTNET_PRIVATE_KEY ?? process.env.SUI_PRIVATE_KEY;
}

export function shareConfigured(): { ok: boolean; reason?: string } {
  const pkg = process.env.NEURUS_SEAL_PACKAGE;
  if (!pkg || pkg === DEMO_PKG) return { ok: false, reason: "NEURUS_SEAL_PACKAGE not set (deploy neurus_share first; demo package can't run grant/revoke)" };
  if (!secretKey()) return { ok: false, reason: "SUI_TESTNET_PRIVATE_KEY not set (a funded testnet key for on-chain txs)" };
  return { ok: true };
}

function pkg(): string {
  const cfg = shareConfigured();
  if (!cfg.ok) throw new Error(cfg.reason);
  return process.env.NEURUS_SEAL_PACKAGE!;
}

function signer(): Ed25519Keypair {
  const raw = secretKey()!.trim();
  if (raw.startsWith("suiprivkey")) {
    const { secretKey: bytes } = decodeSuiPrivateKey(raw);
    return Ed25519Keypair.fromSecretKey(bytes);
  }
  return Ed25519Keypair.fromSecretKey(raw);
}

function client(): SuiJsonRpcClient {
  const network = (process.env.SUI_NETWORK as "mainnet" | "testnet") ?? "testnet";
  return new SuiJsonRpcClient({ url: process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl(network), network });
}

export function ownerAddress(): string {
  return signer().getPublicKey().toSuiAddress();
}

export async function createShare(name: string, kind: "dataset" | "workflow"): Promise<{ shareId: string; capId: string; digest: string }> {
  const tx = new Transaction();
  tx.moveCall({ target: `${pkg()}::share::create_entry`, arguments: [tx.pure.string(name), tx.pure.string(kind)] });
  const res = await client().signAndExecuteTransaction({ signer: signer(), transaction: tx, options: { showObjectChanges: true } });
  const created = (res.objectChanges ?? []).filter((o): o is Extract<typeof o, { type: "created" }> => o.type === "created");
  const shareId = created.find((o) => o.objectType.endsWith("::share::Share"))?.objectId;
  const capId = created.find((o) => o.objectType.endsWith("::share::Cap"))?.objectId;
  if (!shareId || !capId) throw new Error("could not find created Share/Cap in tx result");
  return { shareId, capId, digest: res.digest };
}

async function adminCall(fn: "grant" | "revoke", shareId: string, capId: string, address: string): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({ target: `${pkg()}::share::${fn}`, arguments: [tx.object(shareId), tx.object(capId), tx.pure.address(address)] });
  const res = await client().signAndExecuteTransaction({ signer: signer(), transaction: tx, options: { showEffects: true } });
  return res.digest;
}

export const grantReader = (shareId: string, capId: string, address: string) => adminCall("grant", shareId, capId, address);
export const revokeReader = (shareId: string, capId: string, address: string) => adminCall("revoke", shareId, capId, address);
