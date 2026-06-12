import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Neurus, localTenant } from "../src/index";
import { listSets } from "../src/core/sets";
import { publishSealedDataset, fetchSealedDataset } from "../src/net/share";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

const server = new McpServer({ name: "neurus", version: "0.1.0" });

server.registerTool(
  "list_sets",
  {
    title: "List knowledge sets",
    description: "List the user's Neurus knowledge sets (memory namespaces on Walrus). Returns each set's name, id, and visibility.",
    inputSchema: {},
  },
  async () => {
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
    const nx = await Neurus.open(set ?? "default");
    const r = await nx.note(note);
    return text(`Remembered in "${nx.set.name}". people: ${r.people.map((p) => p.title).join(", ") || "—"} · commitments: ${r.commitments.length}`);
  },
);

server.registerTool(
  "share_set",
  {
    title: "Share a set (Seal + Walrus)",
    description: "Seal-encrypt a set's entire memory and publish it to Walrus. Returns a blob id that can be shared; the data is unreadable without an allowlisted key (custodian-blind). Use this for cross-agent / cross-user memory sharing.",
    inputSchema: { set: z.string().describe("the set to share"), shareId: z.string().optional().describe("Seal share/allowlist id (defaults to the set name)") },
  },
  async ({ set, shareId }) => {
    const r = await publishSealedDataset(set, shareId ?? set, localTenant());
    return text(`Sealed "${set}" → Walrus.\nblobId: ${r.blobId}\nshareId: ${r.shareId}\nneurons: ${r.neurons}\nThe blob is encrypted; only allowlisted readers can decrypt it.`);
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
