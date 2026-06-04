import { rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { createNeuron } from "../src/core/neuron";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const CORPUS = [
  "The production database cluster is identified as PG-CLUSTER-7741 and runs in region us-east-1.",
  "The staging database cluster is identified as PG-CLUSTER-3382 and runs in region eu-west-2.",
  "The analytics database cluster is identified as PG-CLUSTER-9920 and runs in region ap-south-1.",
  "Invoice INV-2024-0815 was paid on net-30 terms for the Atlas engagement.",
  "Invoice INV-2024-0816 is still outstanding and overdue by two weeks.",
  "The treasury multisig requires 5-of-9 signatures with a 48-hour timelock.",
  "The emergency multisig requires 3-of-5 signatures with no timelock.",
  "API key sk-live-Xy92Qd is the production key; rotate it every 90 days.",
  "API key sk-test-Aa10Bb is the sandbox key and can be shared with vendors.",
  "Error code E-4471 means the oracle feed is stale; E-4472 means it is disconnected.",
];

const QUERIES: { q: string; goldIndex: number }[] = [
  { q: "which cluster is PG-CLUSTER-3382", goldIndex: 1 },
  { q: "what region is PG-CLUSTER-9920 in", goldIndex: 2 },
  { q: "status of invoice INV-2024-0816", goldIndex: 4 },
  { q: "how many signatures for the emergency multisig 3-of-5", goldIndex: 6 },
  { q: "what is API key sk-live-Xy92Qd for", goldIndex: 7 },
  { q: "which key is the sandbox key sk-test-Aa10Bb", goldIndex: 8 },
  { q: "what does error code E-4472 mean", goldIndex: 9 },
  { q: "the production database cluster PG-CLUSTER-7741", goldIndex: 0 },
  { q: "invoice INV-2024-0815 payment terms", goldIndex: 3 },
];

async function evalMode(mem: Memory, ids: string[], hybrid: boolean) {
  let recallAt3 = 0;
  let mrr = 0;
  for (const { q, goldIndex } of QUERIES) {
    const goldId = ids[goldIndex];
    const hits = await mem.recall(q, { limit: 3, overFetch: 3, hybrid });
    const rank = hits.findIndex((h) => h.neuron.id === goldId);
    if (rank >= 0 && rank < 3) recallAt3++;
    if (rank >= 0) mrr += 1 / (rank + 1);
  }
  const n = QUERIES.length;
  return { recallAt3: recallAt3 / n, mrr: mrr / n };
}

async function main() {
  const ns = `eval_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);
  const ids: string[] = [];
  for (const text of CORPUS) {
    const n = await mem.remember(createNeuron({ type: "note", title: text.slice(0, 30), body: text }));
    ids.push(n.id);
  }

  console.log(`eval corpus: ${CORPUS.length} neurons · ${QUERIES.length} labeled queries\n`);
  const dense = await evalMode(mem, ids, false);
  const hybrid = await evalMode(mem, ids, true);

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log("                 Recall@3    MRR@5");
  console.log(`  dense-only     ${pct(dense.recallAt3).padEnd(11)} ${dense.mrr.toFixed(3)}`);
  console.log(`  HYBRID (+BM25) ${pct(hybrid.recallAt3).padEnd(11)} ${hybrid.mrr.toFixed(3)}`);
  const dR = (hybrid.recallAt3 - dense.recallAt3) * 100;
  const dM = ((hybrid.mrr - dense.mrr) / Math.max(dense.mrr, 0.001)) * 100;
  console.log(`\n  lift: Recall@3 ${dR >= 0 ? "+" : ""}${dR.toFixed(1)}pp · MRR ${dM >= 0 ? "+" : ""}${dM.toFixed(1)}%`);

  await rm(`.neurus-${ns}.json`, { force: true });
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
