import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { WalrusClient } from "@mysten/walrus";

type Network = "testnet" | "mainnet";
const NETWORK: Network = process.env.WALRUS_NETWORK === "mainnet" ? "mainnet" : "testnet";

export interface ExtendResult {
  objectId: string;
  epochs: number;
  digest: string;
}

export async function extendBlob(objectId: string, secretKey: string, epochs = 5): Promise<ExtendResult> {
  const suiClient = new SuiJsonRpcClient({ url: process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const walrus = new WalrusClient({ network: NETWORK, suiClient });
  const signer = Ed25519Keypair.fromSecretKey(secretKey);
  const { digest } = await walrus.executeExtendBlobTransaction({ blobObjectId: objectId, epochs, signer });
  return { objectId, epochs, digest };
}
