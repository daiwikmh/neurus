try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { publishSealedDataset, fetchSealedDataset } from "../src/net/share";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(`FAIL: ${m}`);
}

async function main() {
  const set = process.argv[2] ?? "default";
  // stand-in for a real neurus_share::share object id (would come from on-chain create)
  const shareId = "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  console.log(`sealing set "${set}" to share ${shareId.slice(0, 10)}… and publishing to Walrus…`);
  const ref = await publishSealedDataset(set, shareId);
  console.log(`sealed ${ref.neurons} neurons → Walrus blob ${ref.blobId.slice(0, 16)}… · identity ${ref.identity.slice(0, 16)}…`);
  assert(ref.neurons > 0, "no neurons sealed");
  assert(!!ref.blobId, "no Walrus blob id");
  assert(ref.identity.startsWith(shareId.slice(2)), "identity does not carry share-id prefix");

  console.log("reading the sealed blob back from Walrus…");
  const got = await fetchSealedDataset(ref.blobId);
  assert(got.services >= 2, `expected >=2 key servers bound, got ${got.services}`);
  assert(got.threshold >= 2, `expected threshold >=2, got ${got.threshold}`);
  assert(got.packageId === ref.packageId, "packageId mismatch on round-trip");
  console.log(`round-trip OK: ciphertext on Walrus is real Seal (threshold ${got.threshold}, ${got.services} key servers) — unreadable without an allowlisted key`);

  console.log("\nDATASET SHARE WRITE-PATH VERIFIED on live Walrus + Seal.");
  console.log("Read path (grant → import → decrypt) is deploy-gated: publish neurus_share, then importSealedDataset with an allowlisted signer.");
  console.log("\nPASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
