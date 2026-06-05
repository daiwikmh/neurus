import { rm } from "node:fs/promises";
import { addDataset, listDatasets, getDataset, updateDataset } from "../src/core/datasets";

const TMP = `.neurus-datasets-test-${Date.now().toString(36)}.json`;
process.env.NEURUS_DATASETS = TMP;

const checks: [string, boolean][] = [];
const check = (n: string, c: boolean) => checks.push([n, c]);

async function main() {
  check("starts empty", (await listDatasets()).length === 0);

  const a = await addDataset({ set: "set_a", kind: "file", title: "notes.md", blobId: "blob1", objectId: "0xabc", endEpoch: 425, bytes: 120 });
  const b = await addDataset({ set: "set_b", kind: "snapshot", title: "b snapshot", blobId: "blob2", objectId: "0xdef", endEpoch: 430 });
  check("ids assigned", a.id.startsWith("ds_") && b.id !== a.id);

  check("scoped list by set", (await listDatasets("set_a")).length === 1);
  check("full list", (await listDatasets()).length === 2);
  check("getDataset", (await getDataset(a.id))?.blobId === "blob1");

  await updateDataset(a.id, { endEpoch: 999, objectId: "0xnew" });
  const updated = await getDataset(a.id);
  check("update persists", updated?.endEpoch === 999 && updated?.objectId === "0xnew");
  check("update leaves others", (await getDataset(b.id))?.endEpoch === 430);

  await rm(TMP, { force: true });
  let ok = true;
  for (const [n, c] of checks) { console.log(`  ${c ? "✓" : "✗"} ${n}`); if (!c) ok = false; }
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
