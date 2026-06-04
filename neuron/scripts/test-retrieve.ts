import { rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { createNeuron } from "../src/core/neuron";
import { Neurus } from "../src/index";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }
process.env.NEURUS_SETS = ".neurus-sets-retrieve.json";

const NOTES = [
  "Sarah is allergic to shellfish, so never book seafood places.",
  "Reminder: Sarah cannot eat shellfish — keep restaurants seafood-free.",
  "The Atlas contract renews in October with net-30 terms.",
];

async function main() {
  const ns = `retr_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);
  for (const t of NOTES) await mem.remember(createNeuron({ type: "note", title: t.slice(0, 32), body: t }));

  const nx = await Neurus.open("retr", { });
  (nx as any).mem = mem;

  console.log("=== retriever-only mode: retrieve() → LangChain-shaped passages ===");
  const passages = await nx.retrieve("what should I know about Sarah and the contract", { topK: 2 });
  for (const p of passages) {
    console.log(`  [rel ${(p.relevance * 100).toFixed(0)}% · ${p.metadata.type}/${p.metadata.trust}] ${p.text.slice(0, 48)}…`);
    console.log(`     metadata: ${JSON.stringify({ id: p.metadata.id, source: p.metadata.source.slice(0, 24), ageHours: p.metadata.ageHours })}`);
  }

  console.log("\n=== MMR diversity (topK 2) ===");
  const plain = await mem.recall("Sarah dietary and the contract", { limit: 2 });
  console.log("without MMR:");
  for (const h of plain) console.log(`  - ${h.neuron.body.slice(0, 50)}`);
  const diverse = await mem.recall("Sarah dietary and the contract", { limit: 2, mmr: 0.4 });
  console.log("with MMR (λ=0.4, penalizes redundancy):");
  for (const h of diverse) console.log(`  - ${h.neuron.body.slice(0, 50)}`);

  await rm(`.neurus-${ns}.json`, { force: true });
  await rm(process.env.NEURUS_SETS!, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
