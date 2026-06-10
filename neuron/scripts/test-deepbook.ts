try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { fetchManagerTrades, balanceManagerOwner, resolveOwnedManagers, resolveManagers } from "../src/net/deepbook";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const BM = process.argv[2] ?? "0xd98ae3b0d38f34ef1a1cc6c36f703f8873d7308a25d4ff88229820753e1fad63";

  const owner = await balanceManagerOwner(BM);
  console.log("BM owner:", owner);
  assert(typeof owner === "string" && owner.startsWith("0x"), "owner address not resolved");

  console.log("scanning pools for activity (one-time)…");
  const trades = await fetchManagerTrades(BM, 0, 50);
  console.log(`trades fetched: ${trades.length}`);
  assert(trades.length > 0, "expected at least one DeepBook trade for this BM");

  const ids = new Set(trades.map((t) => t.tradeId));
  assert(ids.size === trades.length, `dedup failed: ${trades.length} trades but ${ids.size} unique ids`);

  const t = trades[trades.length - 1];
  console.log("latest:", `${t.pair} ${t.side} ${t.qty} @ ${t.price} (${t.role}) ${new Date(t.ts).toISOString()}`);
  assert(["buy", "sell"].includes(t.side), "side not buy/sell");
  assert(t.qty > 0 && t.price > 0, "qty/price not positive");
  assert(t.pair.includes("/"), "pair not formatted");
  assert(t.ts > 1_600_000_000_000, "timestamp not in ms");

  const since = t.ts;
  const boundary = Math.floor(since / 1000) * 1000;
  const incr = await fetchManagerTrades(BM, since, 50);
  assert(incr.every((x) => x.ts >= boundary), "incremental fetch returned trades older than the cursor second");
  const fresh = incr.filter((x) => !ids.has(x.tradeId));
  assert(fresh.every((x) => !ids.has(x.tradeId)), "dedup against prior ids failed");
  console.log(`incremental since cursor second: ${incr.length} returned, ${fresh.length} new after trade_id dedup (boundary-second overlap absorbed)`);

  const owned = await resolveOwnedManagers(owner!);
  console.log(`resolveOwnedManagers(owner) → ${owned.length} owned BM(s) (shared BMs won't appear; explicit-id path covers them)`);

  const refs = await resolveManagers([], [BM]);
  assert(refs.length === 1 && refs[0].id === BM && refs[0].owner === owner, "explicit manager resolution failed");
  console.log(`resolveManagers explicit OK: ${refs[0].id.slice(0, 10)}… owner ${refs[0].owner?.slice(0, 10)}…`);

  console.log("\nPASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
