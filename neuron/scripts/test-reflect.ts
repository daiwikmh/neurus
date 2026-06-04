import { rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { ingestNote } from "../src/ingest/note";
import { reflect } from "../src/proactive/reflect";
import { surface } from "../src/proactive/surface";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const NOTES = [
  "Call with Sarah Chen — she needs the Q3 deck by Friday to brief her team.",
  "Tom Rivera pinged asking when the Q3 deck will be ready.",
  "Priya is blocked on her launch until the Q3 deck is finalized.",
  "Booked a dentist appointment for next Tuesday morning.",
];

async function main() {
  const ns = `reflect_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);

  console.log("=== ingest raw memories ===");
  for (const t of NOTES) { await ingestNote(mem, t); console.log(`  · ${t.slice(0, 52)}…`); }

  console.log("\n=== SLEEP-TIME REFLECTION (synthesize, don't restate) ===");
  const r = await reflect(mem, { recent: 30 });
  console.log(`considered ${r.consideredNeurons} neurons → ${r.insights.length} insight(s):`);
  for (const ins of r.insights) console.log(`  ★ [imp ${((ins.meta?.importance as number) ?? 0).toFixed(2)}] ${ins.body}`);

  console.log("\n=== INTERRUPTION CALCULUS — what's worth attention now ===");
  const s = await surface(mem, { limit: 5 });
  for (const it of s) console.log(`  → [${it.score.toFixed(2)}] (${it.neuron.type}) ${it.neuron.body.slice(0, 64)}  · ${it.reason}`);

  await rm(`.neurus-${ns}.json`, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
