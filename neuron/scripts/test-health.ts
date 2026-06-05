try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

import { putBlobInfo } from "../src/storage/walrus";
import { blobHealth } from "../src/integrity/health";

const checks: [string, boolean][] = [];
const check = (name: string, cond: boolean) => checks.push([name, cond]);

async function main() {
  console.log("=== publish a blob (epochs=5) ===");
  const info = await putBlobInfo(`memory health test ${Date.now()}`, 5);
  console.log(`  blobId=${info.blobId.slice(0, 12)}…  objectId=${info.objectId?.slice(0, 12)}…  end=${info.endEpoch}`);
  check("publish returns Sui object id", !!info.objectId);
  check("publish returns endEpoch", typeof info.endEpoch === "number");

  if (info.objectId) {
    console.log("\n=== read health via Tatum Sui RPC ===");
    const h = await blobHealth(info.objectId);
    console.log(`  certified=${h.certified} (epoch ${h.certifiedEpoch})  start=${h.startEpoch} end=${h.endEpoch}  remaining=${h.epochsRemaining ?? "?"}  expired=${h.expired ?? "?"}`);
    check("health endEpoch matches publish", h.endEpoch === info.endEpoch);
    check("5-epoch storage window", h.endEpoch - h.startEpoch === 5);
    check("certified is boolean", typeof h.certified === "boolean");
    check("current Walrus epoch resolved", typeof h.currentEpoch === "number");
    check("live countdown 0 < remaining ≤ 5", (h.epochsRemaining ?? 0) > 0 && (h.epochsRemaining ?? 99) <= 5);
    check("fresh blob not expired", h.expired === false);
  }

  let ok = true;
  for (const [name, cond] of checks) {
    console.log(`  ${cond ? "✓" : "✗"} ${name}`);
    if (!cond) ok = false;
  }
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
