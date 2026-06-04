import { rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { createNeuron } from "../src/core/neuron";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const now = () => performance.now();
const ms = (a: number) => `${Math.round(performance.now() - a)}ms`;

async function main() {
  const ns = `wb_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);

  const note = createNeuron({ type: "note", title: "t", body: "Sarah is allergic to shellfish and prefers Tuesday calls." });

  let a = now();
  await mem.remember(note, { behind: true });
  console.log(`remember (write-behind) returned in: ${ms(a)}   · durability=${note.meta?.durability}`);

  a = now();
  const hits = await mem.recall("what is Sarah allergic to");
  console.log(`recall RIGHT AFTER (local fallback): ${ms(a)} · found ${hits.length} (${hits[0]?.neuron.body.slice(0, 30)}…)`);

  console.log(`pending before flush: ${mem.pending()}`);
  a = now();
  await mem.flush();
  console.log(`flush (waited for Walrus durability): ${ms(a)} · durability=${note.meta?.durability} · memwalBlob=${note.meta?.memwalBlob ? "set ✓" : "MISSING"}`);
  console.log(`pending after flush: ${mem.pending()}`);

  await rm(`.neurus-${ns}.json`, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
