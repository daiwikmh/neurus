import { rm } from "node:fs/promises";
import { putBlob } from "../src/storage/walrus";
import { ingestWalrusBlob } from "../src/ingest/walrus";
import { resolveSet, openSet } from "../src/core/sets";
import { answer } from "../src/reason/answer";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }
process.env.NEURUS_SETS = ".neurus-sets-demo.json";

const COMPANY_DOC = `Acme Yield Protocol — Documentation

Acme Yield is a lending protocol on Sui. The protocol charges a 0.3% origination fee on every loan.
Liquidations trigger when the collateral ratio falls below 120%. The treasury is controlled by a 4-of-7
multisig with a 48-hour timelock on all parameter changes.

Supported collateral: SUI, USDC, and walUSD. The maximum loan-to-value is 75% for SUI and 85% for USDC.
The insurance fund holds 2% of all interest revenue and currently sits at 1.2M USDC.

Governance: ACME token holders vote on new collateral types. A proposal needs 4% quorum to pass.`;

async function main() {
  console.log("=== step 1: a company already stored its data on Walrus ===");
  const blobId = await putBlob(COMPANY_DOC, 5);
  console.log(`  Acme stored docs → Walrus blob ${blobId}`);

  console.log("\n=== step 2: Neurus ingests THAT Walrus blob → agent-usable knowledge set ===");
  const set = await resolveSet("acme-docs");
  const mem = openSet(set);
  const { source, chunks } = await ingestWalrusBlob(blobId, { title: "Acme Yield docs", maxChars: 500 });
  await mem.ingest(source, chunks);
  console.log(`  indexed into set "${set.name}" (${set.id}) · ${chunks.length} chunk-neurons · trust=${source.source.trust}`);

  console.log("\n=== step 3: an agent reasons over the company's Walrus data (grounded + cited) ===");
  const questions = [
    "What is the origination fee and when do liquidations happen?",
    "What is the maximum LTV for USDC?",
    "How is the treasury controlled?",
  ];
  for (const q of questions) {
    const hits = await mem.recall(q, { limit: 4 });
    const a = await answer(q, hits);
    console.log(`\nQ: ${q}\nA: ${a.text}`);
  }

  await rm(process.env.NEURUS_SETS!, { force: true });
  await rm(set.manifestPath, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
