import { rm } from "node:fs/promises";
import { Neurus } from "../src/index";
import { createNeuron } from "../src/core/neuron";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }
process.env.NEURUS_SETS = ".neurus-sets-integrity.json";

async function main() {
  await rm(process.env.NEURUS_SETS!, { force: true });

  const nx = await Neurus.open("trading-rules");
  await nx.makeVerified();
  console.log(`set "${nx.set.name}" → integrity=${nx.set.integrity}\n`);

  const mem = nx.memory;
  const r1 = await mem.remember(createNeuron({ type: "note", title: "limit", body: "Never hold more than 5% of the portfolio in one asset." }));
  await mem.remember(createNeuron({ type: "note", title: "lev", body: "Maximum leverage is 3x." }));

  console.log("=== checkpoint: compute Merkle root + anchor ===");
  const att = await nx.checkpoint();
  console.log(`  root ${att.root.slice(0, 24)}… · anchored mode=${att.mode} (${att.ref})\n`);

  console.log("=== verify clean memory ===");
  console.log(`  ${JSON.stringify(await nx.verifyIntegrity())}\n`);

  console.log("=== ask on clean verified memory (should answer) ===");
  const a1 = await nx.ask("what is the max position size in one asset?");
  console.log(`  A: ${a1.text.slice(0, 80)}\n`);

  console.log("=== ATTACKER tampers a rule: 5% → 50% ===");
  r1.body = "Never hold more than 50% of the portfolio in one asset.";
  await mem.update(r1);
  console.log(`  ${JSON.stringify(await nx.verifyIntegrity())}\n`);

  console.log("=== ask on TAMPERED verified memory (must REFUSE) ===");
  try {
    await nx.ask("what is the max position size in one asset?");
    console.log("  ✗ answered — integrity gate FAILED");
  } catch (e: any) {
    console.log(`  ✓ REFUSED: ${e.message.slice(0, 90)}`);
  }

  await rm(process.env.NEURUS_SETS!, { force: true });
  await rm(nx.set.manifestPath, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
