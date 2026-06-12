try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { fetchWalletState, describeWallet } from "../src/net/wallet";
import { NetHub } from "../src/net/hub";
import { WorkflowRunner } from "../src/net/workflow";

async function main() {
  let address = process.argv[2];
  let state;
  const t0 = Date.now();
  if (address) {
    state = await fetchWalletState(address);
  } else {
    const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" });
    const txs = await client.queryTransactionBlocks({ limit: 25, order: "descending", options: { showInput: true } });
    const senders = [...new Set(txs.data.map((t) => (t.transaction?.data as any)?.sender).filter(Boolean))] as string[];
    for (const s of senders.slice(0, 8)) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const st = await fetchWalletState(s);
        if (st.totalUsd > 0) {
          address = s;
          state = st;
          break;
        }
      } catch (e: any) {
        if (e?.status === 429) continue;
        throw e;
      }
    }
    if (!state || !address) throw new Error("no funded address among recent senders — rerun or pass one explicitly");
    console.log("discovered funded address:", address);
  }
  console.log(`fetched in ${Date.now() - t0}ms`);
  console.log("holdings:", state.holdings.length, "| totalUsd:", state.totalUsd.toFixed(2), "| unpriced:", state.unpriced.length);
  console.log(describeWallet(state));

  if (!state.holdings.length) console.log("WARN: empty wallet — rerun or pass an address with balances");
  const sui = state.holdings.find((h) => h.coinType === "0x2::sui::SUI");
  if (sui && sui.usd == null) throw new Error("FAIL: native SUI present but unpriced");

  console.log("\n--- runner integration: 2 ticks, epsilon gate ---");
  const hub = new NetHub();
  const runner = new WorkflowRunner(hub, {
    set: "wallet-test",
    netKey: "wallet-test",
    feeds: [],
    assets: [],
    wallets: [address],
    intervalMs: 5000,
    threshold: 0.5,
    epsilon: 0.5,
    reportEvery: 99,
    autoReport: false,
  });
  runner.start();
  await new Promise((r) => setTimeout(r, 11_000));
  runner.stop();
  const snaps = hub.snapshot("wallet-test").neurons.filter((n: any) => n.meta?.kind === "portfolio_snapshot");
  const ticks = runner.status().ticks;
  console.log(`ticks: ${ticks} | snapshot neurons: ${snaps.length}`);
  console.log("snapshot body:", snaps[0]?.body);
  if (ticks < 2) throw new Error("FAIL: expected at least 2 ticks");
  if (snaps.length !== 1) throw new Error(`FAIL: expected exactly 1 snapshot (epsilon gate), got ${snaps.length}`);
  if (snaps[0].source.author !== "wallet-agent") throw new Error("FAIL: wrong author");
  const m = snaps[0].meta as any;
  if (Math.abs(m.totalUsd - state.totalUsd) > Math.max(0.05, state.totalUsd * 0.05)) throw new Error(`FAIL: snapshot totalUsd ${m.totalUsd} far from fetched ${state.totalUsd}`);

  console.log("\nPASS");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
