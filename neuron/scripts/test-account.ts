import { rm, readFile } from "node:fs/promises";
import { Vault } from "../src/identity/vault";
import { AccountManager } from "../src/identity/account";
import { safeTenantId } from "../src/identity/credentials";

const TMP = `.neurus-vault-acct-${Date.now().toString(36)}.json`;
process.env.NEURUS_VAULT = TMP;

const checks: [string, boolean][] = [];
const check = (n: string, c: boolean) => checks.push([n, c]);

async function main() {
  console.log("=== vault refuses plaintext (no NEURUS_VAULT_KEY) ===");
  delete process.env.NEURUS_VAULT_KEY;
  const noKey = new AccountManager(new Vault());
  check("link throws without vault key", await noKey.link("0xWALLET", { accountId: "a", delegateKey: "k" }).then(() => false).catch(() => true));

  console.log("=== ownership link/status/unlink (sealed) ===");
  process.env.NEURUS_VAULT_KEY = "master-secret";
  await rm(TMP, { force: true });
  const acct = new AccountManager(new Vault());
  const alice = "0xAaa111";
  const bob = "0xBbb222";

  check("alice starts unlinked", !(await acct.status(alice)).linked);
  const s = await acct.link(alice, { accountId: "0xACCT_A", delegateKey: "delegate-secret-A", serverUrl: "https://relayer" });
  check("link reports owned", s.linked && s.owned && s.accountId === "0xACCT_A");
  check("status reflects link", (await acct.status(alice)).accountId === "0xACCT_A");
  check("bob isolated", !(await acct.status(bob)).linked);

  const disk = await readFile(TMP, "utf8");
  check("vault sealed on disk", disk.startsWith("neurus-seal-v"));
  check("delegate key NOT in plaintext", !disk.includes("delegate-secret-A"));

  check("provisionAndLink is idempotent (returns existing)", (await acct.provisionAndLink(alice)).accountId === "0xACCT_A");

  check("unlink removes", (await acct.unlink(alice)).unlinked && !(await acct.status(alice)).linked);
  check("unlink twice = false", !(await acct.unlink(alice)).unlinked);

  console.log("=== safeTenantId guards ===");
  check("wallet address passes through", safeTenantId("0xAaa111") === "0xAaa111");
  check("path traversal hashed", safeTenantId("../../etc").startsWith("u_") && !safeTenantId("../../etc").includes("/"));
  check("'local' cannot be impersonated", safeTenantId("local").startsWith("u_"));

  await rm(TMP, { force: true });
  let ok = true;
  for (const [n, c] of checks) { console.log(`  ${c ? "✓" : "✗"} ${n}`); if (!c) ok = false; }
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
