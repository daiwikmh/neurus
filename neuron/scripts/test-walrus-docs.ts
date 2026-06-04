import { rm } from "node:fs/promises";
import { putBlob } from "../src/storage/walrus";
import { ingestWalrusBlob } from "../src/ingest/walrus";
import { resolveSet, openSet } from "../src/core/sets";
import { answer } from "../src/reason/answer";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }
process.env.NEURUS_SETS = ".neurus-sets-walrusdocs.json";

const DOCS = `Walrus Documentation — Core Concepts

Walrus is a decentralized storage network built on Sui. Data is stored as blobs; each blob is a Sui object
with a content-addressed blob ID (the hash of its contents), so the same data always yields the same ID.

Storage duration and epochs. When you store a blob you choose how many epochs to keep it. On Testnet an epoch
is 1 day; on Mainnet an epoch is 2 weeks. A blob becomes unavailable after its expiry epoch, but you can extend
the storage period before it expires.

Encoding and durability (RedStuff). Walrus uses a 2D erasure-coding scheme called RedStuff that splits data
across many storage nodes with only about 4 to 5 times replication. Data can be recovered even if up to two-thirds
of the shards are missing, giving high durability at roughly 80% better storage efficiency than Filecoin.

Quilt — small file batching. Quilt batches up to about 660 small files into a single storage unit. Each file is a
patch with its own QuiltPatchID and immutable native metadata, and can be retrieved individually at low latency.
Quilt reduces cost by roughly 106x for 100KB blobs and 420x for 10KB blobs.

Seal — access control. Seal makes Walrus the first decentralized storage platform with native on-chain access
control and threshold encryption. Data is encrypted with programmable access policies and can be unlocked per policy
without any intermediary controlling access.

Deletable blobs and programmability. Unlike permanent-only storage, Walrus supports deletable blobs: the owner can
disassociate a blob ID from its storage resource to reclaim space. Because blobs are Sui objects, Move smart contracts
can check whether a blob is available and for how long, extend its lifetime, or delete it.

Payments. The WAL token (subdivided into FROST, where 1 WAL = 1 billion FROST) is used to pay for storage and to
delegate stake to storage nodes.`;

async function main() {
  await rm(process.env.NEURUS_SETS!, { force: true });

  console.log("=== step 1: Walrus docs stored ON Walrus (dogfooding) ===");
  const blobId = await putBlob(DOCS, 5);
  console.log(`  docs blob → ${blobId}`);

  console.log("\n=== step 2: Neurus indexes the Walrus docs blob ===");
  const set = await resolveSet("walrus-docs");
  const mem = openSet(set);
  const { source, chunks } = await ingestWalrusBlob(blobId, { title: "Walrus docs", maxChars: 420 });
  await mem.ingest(source, chunks);
  console.log(`  indexed → ${chunks.length} chunk-neurons in set "${set.name}"`);

  console.log("\n=== step 3: 'Ask Walrus AI' — real questions, grounded + cited (the kapa.ai job) ===");
  const questions = [
    "How long does Walrus store my data, and what happens when it expires?",
    "What is Quilt and how much cheaper is it for small files?",
    "Does Walrus support access control or encryption?",
    "How does Walrus keep my data durable if nodes go offline?",
  ];
  for (const q of questions) {
    const hits = await mem.recall(q, { limit: 4 });
    const a = await answer(q, hits);
    console.log(`\nQ: ${q}\nA: ${a.text}`);
  }

  await rm(process.env.NEURUS_SETS!, { force: true });
  await rm(set.manifestPath, { force: true });
  console.log("\n=== done ===");
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
