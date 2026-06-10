import { suiData } from "./suidata";

const INDEXER = process.env.DEEPBOOK_INDEXER_URL ?? "https://deepbook-indexer.mainnet.mystenlabs.com";
const BM_TYPE_SUFFIX = "::balance_manager::BalanceManager";

export interface DbTrade {
  tradeId: string;
  pool: string;
  pair: string;
  side: "buy" | "sell";
  role: "maker" | "taker";
  qty: number;
  price: number;
  quoteQty: number;
  ts: number;
}

export interface BalanceManagerRef {
  id: string;
  owner?: string;
}

const shortBm = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;
export { shortBm };

let poolsCache: string[] | undefined;
async function poolNames(): Promise<string[]> {
  if (poolsCache) return poolsCache;
  try {
    const pools: any[] = await fetch(`${INDEXER}/get_pools`).then((r) => r.json());
    poolsCache = pools.map((p) => p.pool_name).filter(Boolean);
  } catch {
    poolsCache = [];
  }
  return poolsCache;
}

export async function balanceManagerOwner(id: string): Promise<string | undefined> {
  try {
    const o = await suiData().getObject({ id, options: { showContent: true } });
    const owner = (o.data?.content as any)?.fields?.owner;
    return typeof owner === "string" ? owner : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveOwnedManagers(address: string): Promise<string[]> {
  const out: string[] = [];
  try {
    let cursor: string | null | undefined;
    do {
      const page = await suiData().getOwnedObjects({ owner: address, options: { showType: true }, cursor: cursor ?? undefined });
      for (const o of page.data) if (o.data?.type?.endsWith(BM_TYPE_SUFFIX)) out.push(o.data.objectId);
      cursor = page.hasNextPage ? page.nextCursor : undefined;
    } while (cursor);
  } catch {
    void 0;
  }
  return out;
}

const activePoolsCache = new Map<string, string[]>();
async function activePoolsFor(bmId: string): Promise<string[]> {
  const hit = activePoolsCache.get(bmId);
  if (hit) return hit;
  const pools = await poolNames();
  const active: string[] = [];
  for (const pool of pools) {
    const trades = await poolTrades(pool, bmId, 0, 1);
    if (trades.length) active.push(pool);
  }
  activePoolsCache.set(bmId, active);
  return active;
}

async function poolTrades(pool: string, bmId: string, sinceSec: number, limit: number): Promise<DbTrade[]> {
  const base = `${INDEXER}/trades/${pool}?limit=${limit}${sinceSec ? `&start_time=${sinceSec}` : ""}`;
  const roles: ("taker" | "maker")[] = ["taker", "maker"];
  const seen = new Set<string>();
  const out: DbTrade[] = [];
  for (const role of roles) {
    const url = `${base}&${role}_balance_manager_id=${bmId}`;
    let rows: any[];
    try {
      rows = await fetch(url).then((r) => r.json());
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const t of rows) {
      const tradeId = String(t.trade_id ?? t.event_digest ?? "");
      if (!tradeId || seen.has(tradeId)) continue;
      seen.add(tradeId);
      const takerSide = t.type === "sell" ? "sell" : "buy";
      const side = role === "taker" ? takerSide : takerSide === "buy" ? "sell" : "buy";
      const [b, q] = String(pool).split("_");
      out.push({
        tradeId,
        pool,
        pair: b && q ? `${b}/${q}` : pool,
        side,
        role,
        qty: Number(t.base_volume) || 0,
        price: Number(t.price) || 0,
        quoteQty: Number(t.quote_volume) || 0,
        ts: Number(t.timestamp) || 0,
      });
    }
  }
  return out;
}

export async function fetchManagerTrades(bmId: string, sinceMs: number, limitPerPool = 100): Promise<DbTrade[]> {
  const pools = await activePoolsFor(bmId);
  const sinceSec = sinceMs ? Math.floor(sinceMs / 1000) : 0;
  const all: DbTrade[] = [];
  for (const pool of pools) all.push(...(await poolTrades(pool, bmId, sinceSec, limitPerPool)));
  return all.sort((a, b) => a.ts - b.ts);
}

export async function resolveManagers(addresses: string[], explicit: string[]): Promise<BalanceManagerRef[]> {
  const ids = new Set(explicit);
  for (const a of addresses) for (const id of await resolveOwnedManagers(a)) ids.add(id);
  const refs: BalanceManagerRef[] = [];
  for (const id of ids) refs.push({ id, owner: await balanceManagerOwner(id) });
  return refs;
}
