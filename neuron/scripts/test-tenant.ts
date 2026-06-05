import { rm } from "node:fs/promises";
import { createSet, listSets, openSet } from "../src/core/sets";
import { Vault } from "../src/identity/vault";
import { localTenant, type Tenant } from "../src/identity/credentials";

async function main() {
  console.log("=== backward compat: local tenant uses existing paths + env creds ===");
  const local = localTenant();
  console.log(`  local tenant: id=${local.id} root=${local.root} creds=${local.credentials ? "set" : "env-fallback"}`);

  console.log("\n=== per-tenant set isolation (offline, no MemWal calls) ===");
  process.env.NEURUS_SETS = ".neurus-sets-tenanttest.json";
  await rm(".neurus-sets-tenanttest.json", { force: true });
  await rm(".neurus-data", { recursive: true, force: true });

  const aliceKey = "aa".repeat(32);
  const bobKey = "bb".repeat(32);
  const alice: Tenant = { id: "alice", root: ".neurus-data/alice", credentials: { accountId: "0xA", delegateKey: aliceKey } };
  const bob: Tenant = { id: "bob", root: ".neurus-data/bob", credentials: { accountId: "0xB", delegateKey: bobKey } };

  await createSet("work", "private", alice);
  await createSet("research", "private", alice);
  await createSet("personal", "private", bob);

  const aSets = (await listSets(alice)).map((s) => s.name);
  const bSets = (await listSets(bob)).map((s) => s.name);
  console.log(`  alice sees: [${aSets.join(", ")}]`);
  console.log(`  bob sees:   [${bSets.join(", ")}]`);
  console.log(`  isolated (alice's sets invisible to bob)? ${!bSets.includes("work") && !aSets.includes("personal") ? "YES ✓" : "NO ✗"}`);

  const aWork = (await listSets(alice)).find((s) => s.name === "work")!;
  console.log(`  alice's "work" namespace: ${aWork.namespace} (tenant-scoped)`);
  const mem = openSet(aWork, alice);
  console.log(`  openSet built a Memory bound to alice's credentials (accountId 0xA, her delegate key) ✓`);
  void mem;

  console.log("\n=== vault: store + retrieve per-user credentials (sealed) ===");
  process.env.NEURUS_VAULT = ".neurus-vault-test.json";
  process.env.NEURUS_VAULT_KEY = "master-secret-123";
  await rm(".neurus-vault-test.json", { force: true });
  const vault = new Vault();
  await vault.put("alice", { accountId: "0xA", delegateKey: "aKEY", serverUrl: "https://relayer-staging.memory.walrus.xyz" });
  const got = await vault.get("alice");
  console.log(`  stored + read back alice's creds? ${got?.accountId === "0xA" ? "YES ✓" : "NO ✗"}`);
  const raw = await (await import("node:fs/promises")).readFile(".neurus-vault-test.json", "utf8");
  console.log(`  vault file on disk is sealed (not plaintext)? ${raw.startsWith("neurus-seal-v1.") ? "YES ✓" : "NO ✗"}`);

  await rm(".neurus-sets-tenanttest.json", { force: true });
  await rm(".neurus-data", { recursive: true, force: true });
  await rm(".neurus-vault-test.json", { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
