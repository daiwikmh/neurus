import { rm, readFile } from "node:fs/promises";
import { seal, unseal, isSealed } from "../src/access/seal";
import { safeTenantId } from "../src/identity/credentials";
import { Vault } from "../src/identity/vault";

const checks: [string, boolean][] = [];
const check = (n: string, c: boolean) => checks.push([n, c]);

async function main() {
  console.log("=== seal v2 (per-envelope salt) ===");
  const e1 = seal("secret-delegate-key", "master");
  const e2 = seal("secret-delegate-key", "master");
  check("v2 magic", e1.startsWith("neurus-seal-v2."));
  check("round-trips", unseal(e1, "master") === "secret-delegate-key");
  check("same plaintext+key → different envelopes (random salt+iv)", e1 !== e2);
  check("wrong key fails", (() => { try { unseal(e1, "wrong"); return false; } catch { return true; } })());
  check("tamper detected (GCM auth)", (() => { const t = e1.slice(0, -4) + "AAAA"; try { unseal(t, "master"); return false; } catch { return true; } })());

  console.log("=== backward-compat: reads a v1 envelope ===");
  const { scryptSync, createCipheriv, randomBytes } = await import("node:crypto");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", scryptSync("master", "neurus.seal.v1", 32), iv);
  const enc = Buffer.concat([c.update("legacy-value", "utf8"), c.final()]);
  const v1 = ["neurus-seal-v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
  check("isSealed accepts v1", isSealed(v1));
  check("unseal reads legacy v1", unseal(v1, "master") === "legacy-value");

  console.log("=== safeTenantId (path-traversal / injection guard) ===");
  check("valid wallet address passes", safeTenantId("0xabc123DEF") === "0xabc123DEF");
  check("path traversal hashed away", !safeTenantId("../../etc/passwd").includes("/") && safeTenantId("../../etc/passwd").startsWith("u_"));
  check("slash hashed away", !safeTenantId("a/b").includes("/"));
  check("'local' cannot be impersonated", safeTenantId("local").startsWith("u_"));
  check("deterministic", safeTenantId("../x") === safeTenantId("../x"));

  console.log("=== vault refuses plaintext writes ===");
  const TMP = ".neurus-vault-sec-test.json";
  process.env.NEURUS_VAULT = TMP;
  delete process.env.NEURUS_VAULT_KEY;
  await rm(TMP, { force: true });
  const noKey = new Vault();
  check("put throws without NEURUS_VAULT_KEY", await noKey.put("x", { accountId: "a", delegateKey: "k" }).then(() => false).catch(() => true));

  process.env.NEURUS_VAULT_KEY = "vault-master";
  const withKey = new Vault();
  await withKey.put("alice", { accountId: "0xA", delegateKey: "delegate-secret" });
  const onDisk = await readFile(TMP, "utf8");
  check("vault sealed on disk", isSealed(onDisk));
  check("delegate key NOT visible in plaintext", !onDisk.includes("delegate-secret"));
  check("reads back", (await withKey.get("alice"))?.delegateKey === "delegate-secret");
  await rm(TMP, { force: true });

  let ok = true;
  for (const [n, cc] of checks) { console.log(`  ${cc ? "✓" : "✗"} ${n}`); if (!cc) ok = false; }
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((x) => x[1]).length}/${checks.length}) ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
