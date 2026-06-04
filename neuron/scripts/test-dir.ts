import { rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { ingestDir } from "../src/ingest/dir";
import { answer } from "../src/reason/answer";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

async function main() {
  const ns = `dir_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);
  const dir = "/Users/daiwi/project/drip/land";

  console.log(`=== ingest directory (docs/config only, no code) ===`);
  const r = await ingestDir(mem, dir, { max: 5 });
  for (const f of r.files) console.log(`  + ${f.name} (${f.chunks} chunk)`);
  console.log(`  total ${r.totalChunks} chunk-neurons`);

  const qs = ["What is this project and what is it built with?", "How do I run the dev server?"];
  for (const q of qs) {
    const hits = await mem.recall(q, { limit: 5 });
    const a = await answer(q, hits);
    console.log(`\nQ: ${q}\nA: ${a.text}`);
  }

  await rm(`.neurus-${ns}.json`, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
