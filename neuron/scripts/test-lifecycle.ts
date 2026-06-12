import { NetHub } from "../src/net/hub";
import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron, type Neuron } from "../src/core/neuron";
import { WorkflowRunner } from "../src/net/workflow";
import { planConsolidation } from "../src/net/lifecycle";
import { merkleRoot } from "../src/integrity/merkle";

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function priceNeuron(value: number, i: number, anomaly = false): Neuron {
  const n = createNeuron({ type: "note", title: "SUI price", body: `SUI ${value}`, author: "sui-price", meta: { asset: "sui", value, anomaly } });
  n.createdAt = 1_700_000_000_000 + i * 60_000;
  return n;
}

async function main() {
  // ---- 1. pure planConsolidation: exact stats ----
  const values = Array.from({ length: 30 }, (_, i) => 0.7 + i * 0.001);
  const neurons = values.map((v, i) => priceNeuron(v, i));
  neurons.push(priceNeuron(0.95, 5, true), priceNeuron(0.5, 8, true)); // 2 anomalies among the older window

  const plan = planConsolidation(neurons, { keepRecent: 10, minBatch: 4 });
  assert(plan.trends.length === 1, `expected 1 trend, got ${plan.trends.length}`);
  const t = plan.trends[0];
  assert(t.consolidatedIds.length === 20, `expected 20 folded (30-10 keepRecent), got ${t.consolidatedIds.length}`);
  assert(approx(t.stats.min, 0.7), `min ${t.stats.min}`);
  assert(approx(t.stats.max, 0.719), `max ${t.stats.max}`);
  assert(approx(t.stats.mean, values.slice(0, 20).reduce((s, v) => s + v, 0) / 20), `mean ${t.stats.mean}`);
  assert(t.stats.anomalies === 2, `expected 2 anomaly flags counted, got ${t.stats.anomalies}`);
  console.log(`pure plan OK: fold ${t.consolidatedIds.length}, min ${t.stats.min} mean ${t.stats.mean.toFixed(4)} max ${t.stats.max}, ${t.stats.anomalies} anomalies kept`);

  // referenced guard: a synapse pointing at an older obs protects it from folding
  const refId = neurons[0].id;
  const withRef = [...neurons, createNeuron({ type: "insight", title: "ref", body: "x", author: "analyst", synapses: [{ to: refId, kind: "reflects_on" }] })];
  const plan2 = planConsolidation(withRef, { keepRecent: 10, minBatch: 4 });
  assert(!plan2.trends[0].consolidatedIds.includes(refId), "referenced neuron must be protected from folding");
  console.log("referenced-guard OK: protected neuron excluded from fold");

  // ---- 2. live CRDT: prune + root recompute ----
  const hub = new NetHub();
  const SET = "lifecycle-test";
  hub.grant(SET, "sui-price", "sui-price-secret", "write");
  const agent = new SharedReplica("sui-price", "sui-price-secret", new Capabilities());
  for (const n of neurons) await hub.submit(SET, agent.add(n));

  const before = hub.snapshot(SET).neurons.length;
  assert(before === 32, `expected 32 neurons pre-consolidation, got ${before}`);

  const runner = new WorkflowRunner(hub, { set: SET, netKey: SET, feeds: [], assets: ["sui"], wallets: [], intervalMs: 60000, threshold: 0.5, epsilon: 0.5, reportEvery: 99, autoReport: false });
  const folded = await runner.consolidate();

  const snap = hub.snapshot(SET);
  const state = snap.neurons;
  const trends = state.filter((n) => (n.meta as any)?.kind === "trend");
  const anomaliesLeft = state.filter((n) => (n.meta as any)?.asset === "sui" && (n.meta as any)?.anomaly === true);
  const rawsLeft = state.filter((n) => (n.meta as any)?.asset === "sui" && (n.meta as any)?.anomaly !== true);

  console.log(`live consolidation: ${before} → ${state.length} (folded ${folded}); trends=${trends.length}, raws=${rawsLeft.length}, anomalies=${anomaliesLeft.length}`);
  assert(folded === 20, `expected 20 folded, got ${folded}`);
  assert(trends.length === 1, `expected 1 trend neuron, got ${trends.length}`);
  assert(rawsLeft.length === 10, `expected 10 recent raws kept, got ${rawsLeft.length}`);
  assert(anomaliesLeft.length === 2, `expected 2 anomalies preserved, got ${anomaliesLeft.length}`);
  assert(state.length === 13, `expected 13 total (10+2+1), got ${state.length}`);

  const recomputed = merkleRoot(state);
  assert(recomputed === snap.root, `root drift: client ${recomputed.slice(0, 12)} != server ${snap.root.slice(0, 12)}`);
  console.log(`root parity OK after prune: ${snap.root.slice(0, 16)}`);

  console.log("\nPASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
