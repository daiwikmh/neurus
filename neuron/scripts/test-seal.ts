try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { sealForShare, inspectSealed, sealIdentity, approveTransaction } from "../src/access/seal-walrus";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(`FAIL: ${m}`);
}

async function main() {
  // a plausible on-chain Share object id (would come from neurus_share::share::create)
  const shareId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const payload = JSON.stringify({ neurons: 3, secret: "trading-rules snapshot for cross-user share" });

  console.log("encrypting against live Seal testnet key server…");
  const s = await sealForShare(payload, shareId);
  console.log(`sealed ${Buffer.from(s.sealed, "base64").length} bytes · identity ${s.identity.slice(0, 20)}… · pkg ${s.packageId.slice(0, 10)}…`);

  // real Seal ciphertext, not symmetric AES: parse the EncryptedObject metadata back
  const meta = inspectSealed(s.sealed);
  console.log("EncryptedObject:", JSON.stringify(meta));
  assert(meta.packageId === s.packageId, "packageId mismatch in sealed object");
  assert(meta.threshold >= 1, "threshold not set");
  assert(meta.services >= 1, "no key servers bound — not real Seal");
  assert(meta.id === s.identity, "identity mismatch");

  // the identity must carry the share id as its prefix (what seal_approve checks on-chain)
  const prefix = shareId.slice(2);
  assert(s.identity.startsWith(prefix), "identity does not carry the share-id prefix → seal_approve would reject");
  console.log("identity prefix == share id ✓ (seal_approve prefix check would pass)");

  // the approve PTB the recipient would submit (built, not sent — needs deployed package)
  const tx = approveTransaction(shareId, sealIdentity(shareId));
  assert(!!tx, "approve transaction not built");
  console.log("approve PTB constructed (target: <pkg>::share::seal_approve)");

  console.log("\nREAL SEAL ENCRYPTION VERIFIED.");
  console.log("Cross-user DECRYPT is deploy-gated: needs `neurus_share` published + an allowlisted signer.");
  console.log("\nPASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
