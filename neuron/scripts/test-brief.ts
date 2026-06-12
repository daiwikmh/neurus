try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { NetHub } from "../src/net/hub";
import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron } from "../src/core/neuron";
import { WorkflowRunner } from "../src/net/workflow";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const hub = new NetHub();
  const SET = "brief-test";
  const ADDR = "0xffd4f043057226453aeba59732d41c6093516f54823ebc3a16d17f8a77d2f0ad";

  // seed state: a wallet snapshot, an open play, a trend, a postmortem
  hub.grant(SET, "wallet-agent", "wallet-agent-secret", "write");
  hub.grant(SET, "self", `owner:${SET}`, "write");
  hub.grant(SET, "consolidator", "consolidator-secret", "write");
  hub.grant(SET, "analyst", "analyst-secret", "write");
  const wallet = new SharedReplica("wallet-agent", "wallet-agent-secret", new Capabilities());
  const owner = new SharedReplica("self", `owner:${SET}`, new Capabilities());
  const consolidator = new SharedReplica("consolidator", "consolidator-secret", new Capabilities());
  const analyst = new SharedReplica("analyst", "analyst-secret", new Capabilities());

  await hub.submit(SET, wallet.add(createNeuron({ type: "note", title: "Wallet", body: "Portfolio $1.13", author: "wallet-agent", meta: { kind: "portfolio_snapshot", address: ADDR, totalUsd: 1.13, deltaPct: 0 } })));
  await hub.submit(SET, owner.add(createNeuron({ type: "note", title: "Play SUI long", body: "SUI long @ $0.70", author: "self", meta: { kind: "play", asset: "sui", direction: "long", entry: 0.7, status: "open", openedAt: Date.now() } })));
  await hub.submit(SET, consolidator.add(createNeuron({ type: "insight", title: "Trend: SUI price", body: "SUI trend", author: "consolidator", meta: { kind: "trend", label: "SUI price", deltaPct: 2.5 } })));
  await hub.submit(SET, analyst.add(createNeuron({ type: "insight", title: "Post-mortem", body: "Cut SUI losers faster.", author: "analyst", meta: { kind: "postmortem", playId: "x", plPct: -5 } })));

  const runner = new WorkflowRunner(hub, { set: SET, netKey: SET, feeds: [], assets: ["sui"], wallets: [ADDR], intervalMs: 60000, threshold: 0.5, epsilon: 0.5, reportEvery: 99, autoReport: false });

  const first = await runner.maybeDailyBrief();
  assert(first === true, "first maybeDailyBrief should brief");

  const briefs = hub.snapshot(SET).neurons.filter((n) => (n.meta as any)?.kind === "brief");
  assert(briefs.length === 1, `expected exactly 1 brief neuron, got ${briefs.length}`);
  const today = new Date().toISOString().slice(0, 10);
  assert((briefs[0].meta as any).date === today, `brief date should be ${today}`);
  assert(briefs[0].body.length > 0, "brief body empty");
  console.log("brief neuron written:\n" + briefs[0].body);

  // idempotency: a second call the same day must not write another brief
  const second = await runner.maybeDailyBrief();
  assert(second === false, "second maybeDailyBrief same day must be a no-op");
  const after = hub.snapshot(SET).neurons.filter((n) => (n.meta as any)?.kind === "brief");
  assert(after.length === 1, `expected still 1 brief after idempotent retry, got ${after.length}`);
  console.log("idempotency OK: still 1 brief neuron after second call");

  // empty-state set: no sections → no brief
  const hub2 = new NetHub();
  const r2 = new WorkflowRunner(hub2, { set: "empty", netKey: "empty", feeds: [], assets: [], wallets: [], intervalMs: 60000, threshold: 0.5, epsilon: 0.5, reportEvery: 99, autoReport: false });
  assert((await r2.maybeDailyBrief()) === false, "empty set should produce no brief");
  console.log("empty-state OK: no brief when nothing to report");

  console.log("\nPASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
