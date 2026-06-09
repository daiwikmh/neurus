try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}
import { saveSnapshot, loadSnapshots } from "../src/net/persist";

async function main() {
  console.log("vaultKey set:", !!process.env.NEURON_VAULT_KEY);
  const snap = { ops: [], grants: [{ actor: "x", secret: "s", can: "write" as const }] };
  try {
    const blobId = await saveSnapshot("walrustest", snap);
    console.log("saved blobId:", blobId);
    const all = await loadSnapshots();
    console.log("loaded sets:", all.map((a) => `${a.setId}:${a.snap.grants.length}grants`).join(","));
  } catch (e: any) {
    console.log("ERROR:", e?.message);
  }
}

main();
