import { rm } from "node:fs/promises";
import { Neurus } from "../src/index";
import { putBlob } from "../src/storage/walrus";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }
const SETS = ".neurus-sets-infra.json";
process.env.NEURUS_SETS = SETS;

const DOC = `Zephyr Protocol documentation. Zephyr charges a 0.5% swap fee on every trade.
The DAO treasury is controlled by a 5-of-9 multisig. Max leverage is 10x.
The oracle updates every 30 seconds from three independent price sources.`;

async function main() {
  await rm(SETS, { force: true });

  console.log("=== #4 SDK + index data ALREADY on Walrus ===");
  const blobId = await putBlob(DOC, 5);
  const nx = await Neurus.open("zephyr");
  const src = await nx.indexWalrus(blobId, { title: "Zephyr docs", maxChars: 400 });
  console.log(`  indexed ${blobId} → "${src.title}" (trust=${src.source.trust})`);

  const a = await nx.ask("what is the swap fee and how is the treasury controlled?");
  console.log(`  ask → ${a.text}`);

  console.log("\n=== #5 publish manifest to Walrus (sealed) ===");
  const KEY = "demo-share-key-123";
  const manifestBlob = await nx.publish({ sealKey: KEY });
  console.log(`  published sealed manifest → ${manifestBlob}`);

  console.log("\n=== #3 restore: no/wrong key must fail, right key must work ===");
  const other = await Neurus.open("zephyr-copy");
  try {
    await other.restore(manifestBlob);
    console.log("  no-key restore: UNEXPECTEDLY succeeded ✗");
  } catch (e: any) {
    console.log(`  no-key restore blocked ✓ (${e.message})`);
  }
  const count = await other.restore(manifestBlob, { sealKey: KEY });
  console.log(`  keyed restore ✓ → ${count} neurons rebuilt into "zephyr-copy"`);

  await rm(SETS, { force: true });
  await rm(nx.set.manifestPath, { force: true });
  await rm(other.set.manifestPath, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
