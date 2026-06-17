import { stat } from "node:fs/promises";
import * as rlp from "node:readline/promises";
import { Neurus } from "../src/index";
import { listSets } from "../src/core/sets";
import { runAgent, runConfig } from "../src/cli/agent";
import { loadConfig } from "../src/cli/config";
import { loadIdentity } from "../src/cli/identity";
import { loadMcpConfig, saveMcpConfig, mcpConfigPath, type McpConfig } from "../src/cli/mcp-config";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fetchSealedDataset } from "../src/net/share";
import { unsealForReader } from "../src/access/seal-walrus";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

function parseFlags(args: string[]): { set?: string; seal?: string; share?: string; rest: string[] } {
  const rest: string[] = [];
  let set: string | undefined;
  let seal: string | undefined;
  let share: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--set") { set = args[++i]; continue; }
    if (args[i] === "--seal") { seal = args[++i]; continue; }
    if (args[i] === "--share") { share = args[++i]; continue; }
    rest.push(args[i]);
  }
  return { set, seal, share, rest };
}

function usage() {
  console.log(`neurus — AI intelligence layer over Walrus data

  setup                first-time setup — MemWal credentials + MCP config
  agent                interactive agent — chat & plan over a set's memory
  config               set the agent's provider + API key + model
  note "<text>"        remember a note (extracts people, facts, commitments)
  add <file>           store a local file on Walrus + index it (txt/md/csv/json/pdf/docx)
  index <blobId>       index data ALREADY on Walrus into a knowledge set
  ask "<question>"     grounded, cited answer from the set
  brief <name>         pre-meeting brief for a person
  nudges               open loops (things you owe)
  reflect              sleep-time pass: synthesize insights from your memory
  surface ["context"]  what's worth your attention now (interruption calculus)
  map                  what the set knows
  sets                 list knowledge sets
  publish              publish the set's manifest to Walrus (durable/shareable)
  restore <blobId>     rebuild a set from a published manifest
  restore-index        rebuild MemWal vector index from on-chain blobs
  follow <blobId>      import a Seal-gated shared memory (needs --share <shareId>)
  whoami               show this agent's Sui address (share it to get granted access)

  flags: --set <name>  (default "default") · --seal <key>  (publish/restore)
         --share <id>  Share object id (follow command)`);
}

async function main() {
  const [cmd, ...raw] = process.argv.slice(2);
  const { set: setName, seal, share, rest } = parseFlags(raw);
  const arg = rest.join(" ").trim();

  if (!cmd || cmd === "agent" || cmd === "chat") {
    await runAgent(setName ?? "default");
    return;
  }
  if (cmd === "config") {
    await runConfig(await loadConfig());
    return;
  }

  if (cmd === "setup") {
    const rl = rlp.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => rl.question(q);
    const existing = await loadMcpConfig();
    console.log("\nNeurus setup — credentials saved to " + mcpConfigPath);
    console.log("Get your MemWal account at https://memory.walrus.xyz\n");

    const accountId = (await ask(`MemWal account ID${existing?.memwalAccountId ? ` (${existing.memwalAccountId.slice(0, 10)}…)` : ""}: `)).trim() || existing?.memwalAccountId || "";
    const delegateKey = (await ask(`MemWal delegate key${existing?.memwalDelegateKey ? " (keep existing? press enter)" : ""}: `)).trim() || existing?.memwalDelegateKey || "";
    const serverUrl = (await ask(`MemWal server URL (https://relayer.memory.walrus.xyz): `)).trim() || existing?.memwalServerUrl || "https://relayer.memory.walrus.xyz";
    const nvidiaApiKey = (await ask(`NVIDIA API key for ask tool (optional, press enter to skip): `)).trim() || existing?.nvidiaApiKey;
    console.log("\nSharing features need a funded Sui testnet key + deployed neurus_share package.");
    const suiKey = (await ask(`Sui private key (suiprivkey1… or enter to skip): `)).trim() || existing?.suiPrivateKey;
    const sealPkg = suiKey ? ((await ask(`NEURUS_SEAL_PACKAGE (0x… or enter for default): `)).trim() || existing?.sealPackage || "0xfb0728e6e0900c92f4c9b58f8910dad2b74849f394a312f3ca9d718ef68fad03") : existing?.sealPackage;
    rl.close();

    if (!accountId || !delegateKey) { console.error("\nMemWal account ID and delegate key are required."); process.exit(1); }

    const cfg: McpConfig = { memwalAccountId: accountId, memwalDelegateKey: delegateKey, memwalServerUrl: serverUrl };
    if (nvidiaApiKey) cfg.nvidiaApiKey = nvidiaApiKey;
    if (suiKey) cfg.suiPrivateKey = suiKey;
    if (sealPkg) cfg.sealPackage = sealPkg;
    await saveMcpConfig(cfg);

    console.log("\n✓ Saved to " + mcpConfigPath);
    console.log("\nAdd Neurus to Claude Code:");
    console.log("  claude mcp add neurus neurus-mcp --scope user\n");
    return;
  }

  if (cmd === "sets") {
    const sets = await listSets();
    if (!sets.length) { console.log("no knowledge sets yet"); return; }
    for (const s of sets) console.log(`  ${s.name.padEnd(20)} ${s.id} · ${s.visibility}${s.sharedWith.length ? ` · shared with ${s.sharedWith.join(", ")}` : ""}`);
    return;
  }

  if (cmd === "whoami") {
    const identity = await loadIdentity();
    if (!identity) { console.log("no agent identity yet — run: neurus agent"); return; }
    console.log(`name:    ${identity.name}`);
    console.log(`address: ${identity.address}`);
    console.log(`\nShare this address with a Neurus memory owner to get granted access to their feed.`);
    return;
  }

  const neurus = await Neurus.open(setName ?? "default");

  switch (cmd) {
    case "note": {
      if (!arg) return usage();
      const r = await neurus.note(arg);
      console.log(`remembered in "${neurus.set.name}" · people: ${r.people.map((p) => p.title).join(", ") || "—"} · commitments: ${r.commitments.length}`);
      break;
    }
    case "add": {
      if (!arg) return usage();
      const info = await stat(arg).catch(() => null);
      if (info?.isDirectory()) {
        const r = await neurus.addDir(arg, { max: 100 });
        console.log(`added ${r.files.length} file(s) · ${r.totalChunks} chunks from ${arg} → set "${neurus.set.name}"`);
      } else {
        const file = await neurus.addFile(arg);
        console.log(`added ${file.title} → Walrus ${file.blobId} (set "${neurus.set.name}")`);
      }
      break;
    }
    case "index": {
      if (!rest[0]) return usage();
      const source = await neurus.indexWalrus(rest[0], { title: rest.slice(1).join(" ") || undefined });
      console.log(`indexed Walrus blob ${rest[0]} → "${source.title}" into set "${neurus.set.name}" (trust=${source.source.trust})`);
      break;
    }
    case "ask": {
      if (!arg) return usage();
      const a = await neurus.ask(arg);
      console.log(a.text);
      if (a.sources.length) console.log(`\nsources: ${a.sources.join(", ")}`);
      break;
    }
    case "brief": {
      if (!arg) return usage();
      console.log((await neurus.brief(arg)).text);
      break;
    }
    case "nudges": {
      const open = await neurus.nudges();
      if (!open.length) { console.log("no open loops"); break; }
      console.log("open loops:");
      for (const c of open) console.log(`  • ${c.body}`);
      break;
    }
    case "reflect": {
      const r = await neurus.reflect({ recent: 40 });
      console.log(`reflected over ${r.consideredNeurons} memories → ${r.insights.length} insight(s):`);
      for (const ins of r.insights) console.log(`  ★ [imp ${((ins.meta?.importance as number) ?? 0).toFixed(2)}] ${ins.body}`);
      break;
    }
    case "surface": {
      const s = await neurus.surface({ context: arg || undefined, limit: 6 });
      if (!s.length) { console.log("nothing worth surfacing"); break; }
      for (const it of s) console.log(`→ [${it.score.toFixed(2)}] (${it.neuron.type}) ${it.neuron.body.slice(0, 80)}`);
      break;
    }
    case "map": {
      const mem = neurus.memory;
      await mem.ready();
      const all = mem.all();
      const by = (t: string) => all.filter((n) => n.type === t).length;
      console.log(`set "${neurus.set.name}" · people ${by("person")} · files ${by("file")} · notes ${by("note")} · chunks ${by("chunk")}\n`);
      for (const p of all.filter((n) => n.type === "person")) console.log(`  ${p.title}  (${mem.neighbors(p.id).length} links)`);
      break;
    }
    case "publish": {
      const blobId = await neurus.publish(seal ? { sealKey: seal } : {});
      console.log(`published "${neurus.set.name}" manifest → Walrus ${blobId}${seal ? " (sealed)" : ""}`);
      console.log(`restore elsewhere: neurus restore ${blobId} --set <name>${seal ? " --seal <key>" : ""}`);
      break;
    }
    case "restore": {
      if (!rest[0]) return usage();
      const n = await neurus.restore(rest[0], seal ? { sealKey: seal } : {});
      console.log(`restored ${n} neurons into "${neurus.set.name}"`);
      break;
    }
    case "restore-index": {
      const limit = rest[0] ? Number(rest[0]) : 50;
      console.log(`rebuilding MemWal vector index for "${neurus.set.name}" (limit ${limit})…`);
      const r = await neurus.restoreIndex(limit);
      console.log(`done — restored ${r.restored} · skipped ${r.skipped} · total on-chain ${r.total}`);
      break;
    }
    case "follow": {
      const blobId = rest[0];
      const shareId = share ?? rest[1];
      if (!blobId || !shareId) {
        console.error("usage: neurus follow <blobId> --share <shareId> [--set <name>]");
        console.error("  blobId   — Walrus blob id from the feed owner");
        console.error("  shareId  — Sui Share object id (0x…) from the feed owner");
        break;
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(shareId)) {
        console.error("shareId must be a 0x-prefixed 64-hex Sui object id");
        break;
      }
      const identity = await loadIdentity();
      if (!identity) { console.error("no agent identity — run: neurus agent"); break; }
      const { secretKey: keyBytes } = decodeSuiPrivateKey(identity.secretKey);
      const kp = Ed25519Keypair.fromSecretKey(keyBytes);
      const signer = {
        signPersonalMessage: async (msg: Uint8Array) => {
          const { signature } = await kp.signPersonalMessage(msg);
          return { signature };
        },
      };
      console.log(`agent address: ${identity.address}`);
      console.log(`fetching sealed blob ${blobId}…`);
      const { sealedB64 } = await fetchSealedDataset(blobId);
      console.log("requesting decryption key from Seal servers…");
      const plaintext = await unsealForReader(sealedB64, { shareId, address: identity.address, signer });
      const neurons = JSON.parse(plaintext) as unknown[];
      console.log(`decrypted — ${neurons.length} neurons`);
      for (const n of neurons) await neurus.memory.remember(n as never);
      await neurus.flush();
      console.log(`imported ${neurons.length} neurons into "${neurus.set.name}"`);
      break;
    }
    default:
      usage();
  }
}

main().catch((e) => { console.error("❌", e.message ?? e); process.exit(1); });
