import { rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { ingestNote } from "../src/ingest/note";
import { answer } from "../src/reason/answer";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const NOTES = [
  "Sarah needs the Q3 deck by Friday to brief her team.",
  "Priya is blocked on her launch until the Q3 deck is finalized.",
  "Tom asked when the Q3 deck will be ready.",
  "daiwik is the team leader.",
  "daiwik is leading the Q3 deck and he wants it on Saturday.",
];

async function main() {
  const ns = `conflict_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);

  let commitments = 0;
  for (const t of NOTES) {
    const r = await ingestNote(mem, t);
    commitments += r.commitments.length;
  }
  console.log(`extraction: total commitments across notes = ${commitments}`);
  console.log(`  (the fix: "daiwik wants it Saturday" / "Sarah needs it Friday" should NOT be commitments)\n`);

  const q = "when should we submit the Q3 deck?";
  console.log(`Q: ${q}\n`);
  const hits = await mem.recall(q, { limit: 6 });
  const a = await answer(q, hits);
  console.log("A: " + a.text);

  await rm(`.neurus-${ns}.json`, { force: true });
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
