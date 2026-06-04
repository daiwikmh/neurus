import { writeFile, rm } from "node:fs/promises";
import { Memory } from "../src/core/memory";
import { ingestFile } from "../src/ingest/file";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const DOC = `Zephyr Protocol Handbook

Overview. Zephyr is a decentralized perpetuals exchange launched in 2024.

Fees. The base rate is 0.05%. During promotional periods it drops to 0.01%.

Risk. Positions are liquidated when margin falls below the maintenance threshold.

Governance. Token holders vote on parameter changes with a 4% quorum requirement.`;

async function run(contextual: boolean) {
  const ns = `ctx_${contextual ? "on" : "off"}_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}.json`);
  const path = `.zephyr-${ns}.md`;
  await writeFile(path, DOC);
  const { chunks } = await ingestFile(path, { store: false, maxChars: 120, contextual });
  for (const c of chunks) await mem.remember(c);

  if (contextual) {
    const fees = chunks.find((c) => c.body.includes("0.05%"));
    console.log(`  context added to fee chunk: "${fees?.meta?.context}"`);
  }

  const hits = await mem.recall("what is the base trading fee on the exchange", { limit: 1, hybrid: false });
  await rm(path); await rm(`.neurus-${ns}.json`, { force: true });
  return hits[0]?.neuron.body.includes("0.05%") ?? false;
}

async function main() {
  console.log("Query: 'what is the base trading fee on the exchange'");
  console.log("(the fee chunk literally says only 'The base rate is 0.05%' — no 'fee'/'trading'/'exchange' words)\n");
  const off = await run(false);
  console.log(`WITHOUT contextual chunking → found fee chunk? ${off ? "yes" : "NO ✗"}`);
  const on = await run(true);
  console.log(`WITH    contextual chunking → found fee chunk? ${on ? "YES ✓" : "no"}`);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
