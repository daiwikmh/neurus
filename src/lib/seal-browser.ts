import { SealClient, SessionKey, EncryptedObject } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const PKG =
  process.env.NEXT_PUBLIC_NEURUS_SEAL_PACKAGE ?? "0xfb0728e6e0900c92f4c9b58f8910dad2b74849f394a312f3ca9d718ef68fad03";
const KEYSERVERS = (
  process.env.NEXT_PUBLIC_SEAL_KEYSERVERS ?? "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const AGGREGATOR = process.env.NEXT_PUBLIC_SEAL_AGGREGATOR ?? "https://seal-aggregator-testnet.mystenlabs.com";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function decryptSealed(opts: {
  sealedB64: string;
  shareId: string;
  address: string;
  suiClient: SuiJsonRpcClient;
  signPersonalMessage: (message: Uint8Array) => Promise<{ signature: string }>;
}): Promise<string> {
  const sealed = b64ToBytes(opts.sealedB64);
  const identity = EncryptedObject.parse(sealed).id;

  const sealClient = new SealClient({
    suiClient: opts.suiClient as never,
    serverConfigs: KEYSERVERS.map((objectId) => ({ objectId, weight: 1, aggregatorUrl: AGGREGATOR })),
    verifyKeyServers: false,
  });

  const sessionKey = await SessionKey.create({ address: opts.address, packageId: PKG, ttlMin: 10, suiClient: opts.suiClient as never });
  const { signature } = await opts.signPersonalMessage(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signature);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::share::seal_approve`,
    arguments: [tx.pure.vector("u8", Array.from(hexToBytes(identity))), tx.object(opts.shareId)],
  });
  const txBytes = await tx.build({ client: opts.suiClient as never, onlyTransactionKind: true });

  const decrypted = await sealClient.decrypt({ data: sealed, sessionKey, txBytes });
  return new TextDecoder().decode(decrypted);
}
