try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { NoAccessError } from "@mysten/seal";
import { createShare, grantReader, revokeReader } from "../src/net/share-chain";
import { sealForShare, unsealForReader } from "../src/access/seal-walrus";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(`FAIL: ${m}`);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Returns the DEFINITIVE outcome: the decrypted plaintext, "access" (NoAccessError), or "other:<msg>".
// Retries transient testnet propagation errors (key-server fullnode lagging the new Share object).
async function tryUnseal(sealedB64: string, shareId: string, address: string, signer: Ed25519Keypair): Promise<string> {
  for (let i = 0; i < 16; i++) {
    try {
      return await unsealForReader(sealedB64, { shareId, address, signer });
    } catch (e) {
      if (e instanceof NoAccessError) return "access";
      const msg = (e as Error).message ?? "";
      if (/No module found|not available for consumption|is not available|version|deseriali/i.test(msg)) {
        await wait(5000);
        continue;
      }
      return `other:${msg}`;
    }
  }
  return "other:propagation timeout";
}

async function main() {
  const KEY = (process.env.SUI_TESTNET_PRIVATE_KEY ?? process.env.SUI_PRIVATE_KEY)!.trim();
  const keypair = Ed25519Keypair.fromSecretKey(KEY);
  const me = keypair.getPublicKey().toSuiAddress();
  console.log("owner/reader:", me, "\npackage:", process.env.NEURUS_SEAL_PACKAGE);

  console.log("\n[1] create Share on-chain…");
  const { shareId, capId, digest } = await createShare("e2e-test", "dataset");
  console.log("    share", shareId.slice(0, 14), "· cap", capId.slice(0, 14), "· tx", digest.slice(0, 10));
  await wait(3000);

  console.log("[2] grant reader on-chain…");
  const gd = await grantReader(shareId, capId, me);
  console.log("    granted · tx", gd.slice(0, 10));
  await wait(15000); // let key-server fullnodes index the Share + grant

  console.log("[3] seal a payload, then decrypt as the granted reader — should SUCCEED…");
  const secret = `cross-user seal proof ${Date.now()}`;
  const sealed = await sealForShare(secret, shareId);
  console.log("    sealed", Buffer.from(sealed.sealed, "base64").length, "bytes via seal_approve + key servers");
  const after = await tryUnseal(sealed.sealed, shareId, me, keypair);
  assert(after === secret, `expected decrypted plaintext, got: ${after}`);
  console.log("    decrypted ✓ →", after);

  console.log("[4] revoke reader on-chain…");
  const rd = await revokeReader(shareId, capId, me);
  console.log("    revoked · tx", rd.slice(0, 10));
  await wait(12000);

  // revocation blocks NEW key fetches; cached keys linger until TTL → test a FRESH identity.
  console.log("[5] seal a fresh payload, decrypt should now be DENIED…");
  const sealed2 = await sealForShare(`post-revoke ${Date.now()}`, shareId);
  const post = await tryUnseal(sealed2.sealed, shareId, me, keypair);
  assert(post === "access", `expected NoAccessError after revoke, got: ${post}`);
  console.log("    denied ✓ (NoAccessError — revoked, new key fetch blocked)");

  console.log("\nFULL CROSS-USER SEAL FLOW VERIFIED ON-CHAIN: grant→decrypt, revoke→denied.");
  console.log("PASS");
}

main().catch((e) => {
  console.error("\nFAILED:", e?.message ?? e);
  process.exit(1);
});
