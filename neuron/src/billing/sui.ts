import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const SUI_COIN = "0x2::sui::SUI";
const MIST = 1_000_000_000;

// Payments come from the user's dapp-kit wallet, which defaults to testnet — so billing
// verification runs on its OWN network (NOT the mainnet DeepBook data client).
let client: SuiJsonRpcClient | undefined;
function billingClient(): SuiJsonRpcClient {
  if (!client) {
    const network = (process.env.BILLING_SUI_NETWORK as "mainnet" | "testnet") ?? "testnet";
    client = new SuiJsonRpcClient({ url: process.env.BILLING_SUI_RPC_URL ?? getJsonRpcFullnodeUrl(network), network });
  }
  return client;
}

// Read env LAZILY — these modules are imported (hoisted) before server.ts runs loadEnvFile(),
// so module-level consts would capture unset values. Getters read at call time instead.
export function priceUsd(): number {
  return Number(process.env.BILLING_PRICE_USD ?? 5);
}
export function treasury(): string {
  return process.env.BILLING_TREASURY_ADDRESS ?? "";
}
// Accept slightly less than quoted to absorb price drift between quote and send.
function tolerance(): number {
  return Number(process.env.BILLING_TOLERANCE ?? 0.9);
}

export function billingConfigured(): boolean {
  return !!treasury();
}

async function suiPriceUsd(): Promise<number> {
  const res = await fetch("https://coins.llama.fi/prices/current/coingecko:sui");
  if (!res.ok) throw new Error(`price feed HTTP ${res.status}`);
  const data: any = await res.json();
  const price = data?.coins?.["coingecko:sui"]?.price;
  if (!price || price <= 0) throw new Error("no SUI price");
  return price;
}

export async function priceSui(): Promise<number> {
  return priceUsd() / (await suiPriceUsd());
}

function ownerAddr(owner: any): string | undefined {
  return owner?.AddressOwner ?? owner?.ObjectOwner ?? undefined;
}

export interface VerifyResult {
  ok: boolean;
  amountSui: number;
  reason?: string;
}

// Verify a settled tx: `sender` paid at least priceUsd() worth of SUI to the treasury.
export async function verifyPayment(digest: string, sender: string): Promise<VerifyResult> {
  const treasuryAddr = treasury();
  if (!treasuryAddr) return { ok: false, amountSui: 0, reason: "treasury not configured" };
  const tx = await billingClient().getTransactionBlock({ digest, options: { showBalanceChanges: true, showInput: true } });

  const txSender = (tx as any).transaction?.data?.sender as string | undefined;
  if (txSender && sender && txSender.toLowerCase() !== sender.toLowerCase()) {
    return { ok: false, amountSui: 0, reason: "payment came from a different wallet than your account" };
  }

  const changes = (tx.balanceChanges ?? []) as { owner: any; coinType: string; amount: string }[];
  const toTreasury = changes.find(
    (c) => c.coinType === SUI_COIN && ownerAddr(c.owner)?.toLowerCase() === treasuryAddr.toLowerCase() && Number(c.amount) > 0,
  );
  if (!toTreasury) return { ok: false, amountSui: 0, reason: "no SUI payment to the treasury found in this transaction" };

  const amountSui = Number(toTreasury.amount) / MIST;
  const required = (await priceSui()) * tolerance();
  if (amountSui < required) {
    return { ok: false, amountSui, reason: `paid ${amountSui.toFixed(4)} SUI, need ~${required.toFixed(4)} SUI` };
  }
  return { ok: true, amountSui };
}
