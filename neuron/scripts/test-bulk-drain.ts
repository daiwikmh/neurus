import { rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { createNeuron } from "../src/core/neuron";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const now = () => performance.now();
const ms = (a: number) => `${Math.round(performance.now() - a)}ms`;

async function main() {
  const ns = `bulk_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);

  const N = 12;
  const notes = Array.from({ length: N }, (_, i) =>
    createNeuron({ type: "note", title: `n${i}`, body: `Fact number ${i}: the Walrus quorum tolerates up to one-third byzantine nodes (item ${i}).` }),
  );

  let a = now();
  for (const n of notes) await mem.remember(n, { behind: true });
  console.log(`queued ${N} write-behind in ${ms(a)} · pending=${mem.pending()}`);

  a = now();
  await mem.flush();
  console.log(`flush (bulk drain) completed in ${ms(a)}`);

  const confirmed = notes.filter((n) => n.meta?.durability === "confirmed" && n.meta?.memwalBlob).length;
  const failed = notes.filter((n) => n.meta?.durability === "failed").length;
  console.log(`confirmed with real blob id: ${confirmed}/${N} · failed: ${failed} · pending after: ${mem.pending()}`);
  console.log(`sample blob id: ${notes[0].meta?.memwalBlob ?? "MISSING"}`);

  const hits = await mem.recall("how many byzantine nodes does Walrus tolerate", { limit: 5 });
  console.log(`recall after durability: ${hits.length} hits · top="${hits[0]?.neuron.body.slice(0, 40)}…"`);

  await rm(`.neurus-${ns}.json`, { force: true });
  console.log(confirmed === N ? "\n=== PASS: bulk path confirmed all writes ===" : "\n=== CHECK: not all writes confirmed ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
