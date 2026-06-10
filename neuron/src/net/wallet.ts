import { suiData as sui } from "./suidata";

export interface Holding {
  coinType: string;
  symbol: string;
  amount: number;
  usd: number | null;
}

export interface WalletState {
  address: string;
  totalUsd: number;
  holdings: Holding[];
  unpriced: string[];
}

const SUI_TYPE = "0x2::sui::SUI";

const metaCache = new Map<string, { symbol: string; decimals: number }>();

async function coinMeta(coinType: string): Promise<{ symbol: string; decimals: number }> {
  const hit = metaCache.get(coinType);
  if (hit) return hit;
  let meta = { symbol: coinType.split("::").pop() ?? coinType, decimals: 9 };
  try {
    const m = await sui().getCoinMetadata({ coinType });
    if (m) meta = { symbol: m.symbol, decimals: m.decimals };
  } catch {
    void 0;
  }
  metaCache.set(coinType, meta);
  return meta;
}

const SYMBOL_IDS: Record<string, string> = {
  SUI: "sui",
  WAL: "walrus-2",
  USDC: "usd-coin",
  USDT: "tether",
  CETUS: "cetus-protocol",
  WETH: "ethereum",
  WBTC: "wrapped-bitcoin",
};

function priceKeys(coinType: string, symbol: string): string[] {
  const keys = coinType === SUI_TYPE ? ["coingecko:sui"] : [`sui:${coinType}`];
  const cg = SYMBOL_IDS[symbol.toUpperCase()];
  if (cg && !keys.includes(`coingecko:${cg}`)) keys.push(`coingecko:${cg}`);
  return keys;
}

async function fetchPrices(keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!keys.length) return out;
  try {
    const r: any = await fetch(`https://coins.llama.fi/prices/current/${keys.join(",")}`).then((x) => x.json());
    for (const [k, v] of Object.entries(r?.coins ?? {})) {
      const p = (v as any)?.price;
      if (typeof p === "number" && Number.isFinite(p)) out.set(k, p);
    }
  } catch {
    void 0;
  }
  return out;
}

export async function fetchWalletState(address: string): Promise<WalletState> {
  const balances = await sui().getAllBalances({ owner: address });
  const nonzero = balances.filter((b) => BigInt(b.totalBalance) > 0n);
  const metas = await Promise.all(nonzero.map((b) => coinMeta(b.coinType)));
  const keysPer = nonzero.map((b, i) => priceKeys(b.coinType, metas[i].symbol));
  const prices = await fetchPrices([...new Set(keysPer.flat())]);

  const holdings: Holding[] = nonzero.map((b, i) => {
    const amount = Number(b.totalBalance) / 10 ** metas[i].decimals;
    const price = keysPer[i].map((k) => prices.get(k)).find((p) => p != null);
    return { coinType: b.coinType, symbol: metas[i].symbol, amount, usd: price != null ? amount * price : null };
  });

  return {
    address,
    totalUsd: holdings.reduce((s, h) => s + (h.usd ?? 0), 0),
    holdings: holdings.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)),
    unpriced: holdings.filter((h) => h.usd == null).map((h) => h.symbol),
  };
}

export function describeWallet(w: WalletState): string {
  const top = w.holdings.slice(0, 6).map((h) => `${h.symbol} ${h.amount >= 1 ? h.amount.toFixed(2) : h.amount.toPrecision(3)}${h.usd != null ? ` ($${h.usd.toFixed(2)})` : ""}`);
  const extra = w.unpriced.length ? ` · unpriced: ${w.unpriced.join(",")}` : "";
  return `Portfolio $${w.totalUsd.toFixed(2)} — ${top.join(", ")}${extra}`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
