import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Neurus, localTenant } from "../src/index";
import { listSets } from "../src/core/sets";
import { publishSealedDataset, fetchSealedDataset } from "../src/net/share";
import { createShare, grantReader, shareConfigured } from "../src/net/share-chain";
import { createFeed, listFeeds } from "../src/core/feeds";

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stat } from "node:fs/promises";
import { loadMcpConfig, applyMcpConfig } from "../src/cli/mcp-config";

const _dir = dirname(fileURLToPath(import.meta.url));
// dev: load local .env.local; prod: overridden by ~/.neurus/mcp.json below
try { process.loadEnvFile(join(_dir, "../.env.local")); } catch { /* noop */ }
// user config always wins — load after .env.local so it takes precedence
const _mcpCfg = await loadMcpConfig();
if (_mcpCfg) applyMcpConfig(_mcpCfg);

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

function notConfigured(): ReturnType<typeof text> | null {
  if (!process.env.MEMWAL_ACCOUNT_ID || !process.env.MEMWAL_DELEGATE_KEY) {
    return text("Neurus is not configured yet.\n\nRun: neurus setup\n\nThis walks you through connecting your MemWal account (https://memory.walrus.xyz) and saves credentials to ~/.neurus/mcp.json.");
  }
  return null;
}

const server = new McpServer({ name: "neurus", version: "0.1.0" });

server.registerTool(
  "list_sets",
  {
    title: "List knowledge sets",
    description: "List the user's Neurus knowledge sets (memory namespaces on Walrus). Returns each set's name, id, and visibility.",
    inputSchema: {},
  },
  async () => {
    const nc = notConfigured(); if (nc) return nc;
    const sets = await listSets();
    if (!sets.length) return text("No knowledge sets yet.");
    return text(sets.map((s) => `${s.name} · ${s.id} · ${s.visibility}${s.sharedWith.length ? ` · shared with ${s.sharedWith.join(", ")}` : ""}`).join("\n"));
  },
);

server.registerTool(
  "recall",
  {
    title: "Recall memories",
    description: "Semantic search over a set's memory (Walrus-backed). Returns the most relevant neurons with their relevance scores. Use this to ground answers in the user's owned memory.",
    inputSchema: { query: z.string().describe("what to search for, in natural language"), set: z.string().optional().describe("knowledge set name (default: 'default')"), limit: z.number().optional().describe("max results (default 6)") },
  },
  async ({ query, set, limit }) => {
    const nc = notConfigured(); if (nc) return nc;
    const nx = await Neurus.open(set ?? "default");
    const hits = await nx.recall(query, { limit: limit ?? 6 });
    if (!hits.length) return text("(no relevant memories in this set)");
    return text(hits.map((h) => `[${h.score.toFixed(2)}] ${h.neuron.title}\n${h.neuron.body.replace(/\s+/g, " ").trim()}`).join("\n\n"));
  },
);

server.registerTool(
  "ask",
  {
    title: "Ask the memory",
    description: "Ask a question and get a grounded, cited answer composed only from the set's memory. Surfaces conflicts and says when the memory does not contain the answer.",
    inputSchema: { question: z.string(), set: z.string().optional().describe("knowledge set name (default: 'default')") },
  },
  async ({ question, set }) => {
    const nc = notConfigured(); if (nc) return nc;
    const nx = await Neurus.open(set ?? "default");
    const a = await nx.ask(question);
    return text(a.sources.length ? `${a.text}\n\nSources: ${a.sources.join(", ")}` : a.text);
  },
);

server.registerTool(
  "remember",
  {
    title: "Remember",
    description: "Save a new memory to a set. Extracts people, facts, and commitments and stores it durably (Walrus + vector index). Use this to let the user's memory persist across agents and sessions.",
    inputSchema: { text: z.string().describe("the note / fact to remember"), set: z.string().optional().describe("knowledge set name (default: 'default')") },
  },
  async ({ text: note, set }) => {
    const nc = notConfigured(); if (nc) return nc;
    const nx = await Neurus.open(set ?? "default");
    const r = await nx.note(note);
    return text(`Remembered in "${nx.set.name}". people: ${r.people.map((p) => p.title).join(", ") || "—"} · commitments: ${r.commitments.length}`);
  },
);

server.registerTool(
  "add",
  {
    title: "Add a file or folder to memory",
    description: "Ingest a local file or directory into a set — chunks, embeds, and stores it on Walrus so it becomes recall-/ask-able. Use this to upload blogs, docs, notes, or whole folders (txt/md/csv/json/pdf/docx).",
    inputSchema: {
      path: z.string().describe("absolute path to a file or folder on disk"),
      set: z.string().optional().describe("knowledge set name (default: 'default')"),
    },
  },
  async ({ path, set }) => {
    const nc = notConfigured(); if (nc) return nc;
    const info = await stat(path).catch(() => null);
    if (!info) return text(`Path not found: ${path}`);
    const nx = await Neurus.open(set ?? "default");
    if (info.isDirectory()) {
      const r = await nx.addDir(path, { max: 100 });
      return text(`Added ${r.files.length} file(s) · ${r.totalChunks} chunks from ${path} → set "${nx.set.name}". Now recall or ask over it.`);
    }
    const file = await nx.addFile(path);
    return text(`Added "${file.title}" → Walrus ${file.blobId ?? "(indexed)"} (set "${nx.set.name}"). Now recall or ask over it.`);
  },
);

server.registerTool(
  "ingest_web",
  {
    title: "Ingest a blog or web page URL",
    description: "Fetch a blog post or website, extract the readable content, then chunk + embed it into a set so it becomes recall-/ask-able. For JS-heavy sites pass a direct article URL. Set max>1 to crawl multiple linked pages.",
    inputSchema: {
      url: z.string().describe("the blog/article/site URL"),
      set: z.string().optional().describe("knowledge set name (default: 'default')"),
      max: z.number().optional().describe("max pages to crawl (default 1; a single blog post needs 1)"),
    },
  },
  async ({ url, set, max }) => {
    const nc = notConfigured(); if (nc) return nc;
    const nx = await Neurus.open(set ?? "default");
    try {
      const r = await nx.addSite(url, { max: max ?? 1 });
      return text(`Ingested ${r.pages} page(s) from ${url} → set "${nx.set.name}" (${r.failed} failed, ${r.skipped} skipped). Now recall or ask over it.`);
    } catch (e) {
      return text(`Could not ingest ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.registerTool(
  "list_blobs",
  {
    title: "List uploaded Walrus blobs",
    description: "List the files uploaded to Walrus in a set, with each file's Walrus blobId and chunk count. Use this to see what has actually been stored on-chain for a set.",
    inputSchema: { set: z.string().optional().describe("knowledge set name (default: 'default')") },
  },
  async ({ set }) => {
    const nc = notConfigured(); if (nc) return nc;
    const nx = await Neurus.open(set ?? "default");
    const all = await nx.neurons();
    const files = all.filter((n) => n.type === "file");
    if (!files.length) return text(`No files uploaded to "${nx.set.name}" yet. Use the 'add' tool to upload one.`);
    const lines = files.map((f) => {
      const chunks = all.filter((n) => (n.meta?.file as string) === f.id).length;
      return `${f.title}\n  blobId: ${f.blobId ?? "(local only — not on Walrus)"}\n  chunks: ${chunks}`;
    });
    return text(`Uploaded blobs in "${nx.set.name}":\n\n${lines.join("\n\n")}`);
  },
);

server.registerTool(
  "create_feed",
  {
    title: "Create a shareable memory feed",
    description: "Create an on-chain Seal allowlist (Share object), seal-encrypt the set's neurons, upload to Walrus, and return the shareId + blobId. Grant the reader's Sui address with grant_feed before they can decrypt. Requires NEURUS_SEAL_PACKAGE + SUI_TESTNET_PRIVATE_KEY to be configured.",
    inputSchema: {
      set: z.string().describe("knowledge set to share"),
      name: z.string().optional().describe("feed display name (default: set name)"),
    },
  },
  async ({ set, name }) => {
    const cfg = shareConfigured();
    if (!cfg.ok) return text(`Cannot create feed: ${cfg.reason}`);
    const tenant = localTenant();
    const { shareId, capId } = await createShare(name ?? set, "dataset");
    const pub = await publishSealedDataset(set, shareId, tenant);
    await createFeed(tenant, { set, name: name ?? set, shareId, capId, blobId: pub.blobId, identity: pub.identity, neurons: pub.neurons });
    return text(`Feed created for "${set}".\n\nshareId: ${pub.shareId}\nblobId:  ${pub.blobId}\nneurons: ${pub.neurons}\n\nNext: use grant_feed to allow a Sui address to decrypt this feed.\nReader runs: neurus follow ${pub.blobId} --share ${pub.shareId}`);
  },
);

server.registerTool(
  "grant_feed",
  {
    title: "Grant a Sui address access to a feed",
    description: "Add a Sui address to a feed's on-chain allowlist so they can decrypt it. The reader gets the blobId + shareId and decrypts with their own key — nothing is custodied.",
    inputSchema: {
      shareId: z.string().describe("Share object id (0x…) from create_feed"),
      capId: z.string().describe("Cap object id (0x…) from create_feed — needed to authorize the grant"),
      address: z.string().describe("reader's Sui address (0x…) — they run `neurus whoami` to get this"),
    },
  },
  async ({ shareId, capId, address }) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(shareId)) return text("shareId must be a 0x-prefixed 64-hex Sui object id");
    if (!/^0x[0-9a-fA-F]{64}$/.test(address)) return text("address must be a 0x-prefixed 64-hex Sui address");
    const cfg = shareConfigured();
    if (!cfg.ok) return text(`Cannot grant: ${cfg.reason}`);
    await grantReader(shareId, capId, address);
    return text(`Granted ${address} access to share ${shareId}.\n\nThey can now decrypt with:\n  neurus follow <blobId> --share ${shareId}`);
  },
);

server.registerTool(
  "list_feeds",
  {
    title: "List memory feeds",
    description: "List all published memory feeds for a set, including their shareId, blobId, and who has been granted access.",
    inputSchema: { set: z.string().optional().describe("filter by set name") },
  },
  async ({ set }) => {
    const nc = notConfigured(); if (nc) return nc;
    const feeds = await listFeeds(localTenant(), set);
    if (!feeds.length) return text("No feeds yet. Use create_feed to publish one.");
    return text(feeds.map((f) => `${f.name}\n  shareId: ${f.shareId}\n  blobId:  ${f.blobId}\n  neurons: ${f.neurons}\n  grants:  ${f.grants.length ? f.grants.join(", ") : "none"}`).join("\n\n"));
  },
);

server.registerTool(
  "share_set",
  {
    title: "Re-seal a set under an existing Share object",
    description: "Re-encrypt a set's current neurons and update the Walrus blob for an existing share. Use this to refresh a feed after adding new memories. The shareId must be a real Sui Share object id (0x…64hex) — use create_feed to create one first.",
    inputSchema: {
      set: z.string().describe("the set to share"),
      shareId: z.string().describe("existing Sui Share object id (0x…) — from create_feed or list_feeds"),
    },
  },
  async ({ set, shareId }) => {
    const nc = notConfigured(); if (nc) return nc;
    if (!/^0x[0-9a-fA-F]{64}$/.test(shareId)) return text("shareId must be a 0x-prefixed 64-hex Sui object id — use create_feed to get one");
    const r = await publishSealedDataset(set, shareId, localTenant());
    return text(`Re-sealed "${set}" → Walrus.\nblobId:  ${r.blobId}\nshareId: ${r.shareId}\nneurons: ${r.neurons}\n\nReader runs: neurus follow ${r.blobId} --share ${r.shareId}`);
  },
);

server.registerTool(
  "inspect_share",
  {
    title: "Inspect a sealed share",
    description: "Inspect a sealed dataset blob on Walrus without decrypting it. Confirms it is real Seal-encrypted data and reports the package id, threshold, and key-server count.",
    inputSchema: { blobId: z.string() },
  },
  async ({ blobId }) => {
    const r = await fetchSealedDataset(blobId);
    return text(`Sealed dataset.\npackageId: ${r.packageId}\nthreshold: ${r.threshold}\nkeyServers: ${r.services}`);
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("neurus MCP server ready on stdio");
}

main().catch((e) => {
  console.error("neurus MCP server failed:", e);
  process.exit(1);
});
