import * as readline from "node:readline";
import * as rlp from "node:readline/promises";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Neurus, answer } from "../index";
import { pickPath } from "./filepicker";
import { listSets } from "../core/sets";
import { setBlobOwner } from "../storage/walrus";
import * as screen from "./screen";
import { orChat } from "../llm/openrouter";
import { chat as nvidiaChat } from "../llm/nvidia";
import { banner, strip, box, c, info, ok, warn, err, shortId } from "./ui";
import { loadConfig, saveConfig, applyConfig, configPath, DEFAULT_MODEL, type CliConfig, type Provider } from "./config";
import { loadIdentity, createIdentity, tenantFor, identityPath, shortAddr, type AgentIdentity } from "./identity";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fetchSealedDataset } from "../net/share";
import { unsealForReader } from "../access/seal-walrus";
import { createShare, grantReader, shareConfigured } from "../net/share-chain";
import { publishSealedDataset } from "../net/share";
import { createFeed, listFeeds, getFeed, type Feed } from "../core/feeds";

function ask(rl: rlp.Interface, q: string): Promise<string> {
  return rl.question(q);
}

function askHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as any)._writeToOutput = (str: string) => {
      if (str.includes("\n") || str === query) (rl as any).output.write(str);
      else (rl as any).output.write("*");
    };
    rl.question(query, (a) => {
      rl.close();
      process.stdout.write("\n");
      resolve(a.trim());
    });
  });
}

export async function runConfig(existing?: CliConfig | null): Promise<CliConfig> {
  const rl = rlp.createInterface({ input: process.stdin, output: process.stdout });
  try {
    info("Set up the agent's model provider. Keys are stored locally at " + c.dim(configPath));
    let provider: Provider = existing?.provider ?? "openrouter";
    const p = (await ask(rl, c.cyan("> ") + `provider [nvidia/openrouter] (${provider}) `)).trim().toLowerCase();
    if (p === "nvidia" || p === "openrouter") provider = p;

    const key = await askHidden(c.cyan("> ") + `${provider} API key `);
    if (!key) throw new Error("an API key is required");

    const defModel = existing?.provider === provider ? existing.model : DEFAULT_MODEL[provider];
    const m = (await ask(rl, c.cyan("> ") + `model (${defModel}) `)).trim();
    const model = m || defModel;

    const cfg: CliConfig = { provider, apiKey: key, model };
    await saveConfig(cfg);
    ok(`saved · ${provider} · ${model}`);
    return cfg;
  } finally {
    rl.close();
  }
}

const PLAN_SYSTEM = `You are a planning agent grounded in the user's private memory.
From the goal and the memory items provided, produce a concise, numbered, actionable plan.
Use ONLY what the memory supports; cite items you rely on as [n]. Where the memory is silent on
something the plan needs, add a short "Gaps:" line naming what's missing. No preamble, no filler.`;

function agentChat(cfg: CliConfig, system: string, user: string): Promise<string> {
  if (cfg.provider === "openrouter") return orChat(system, user, { model: cfg.model, maxTokens: 900 });
  return nvidiaChat(system, user, { maxTokens: 900 });
}

function helpBox(): void {
  box("commands", [
    `${c.bold("<text>")}        ask / talk — grounded in this set's memory`,
    `${c.bold("/plan <goal>")}  build a numbered plan from memory`,
    `${c.bold("/recall <q>")}   show the memories that match a query`,
    `${c.bold("/note <text>")}  save a new memory to this set`,
    `${c.bold("/add <path>")}   upload a local file or folder → Walrus, index it here`,
    `${c.bold("@")}             type @ to browse files in this folder, pick one to ask over it`,
    `${c.bold("/blobs")}        list files uploaded to Walrus in this set`,
    `${c.bold("/publish")}      snapshot this memory to Walrus (prints the blob)`,
    `${c.bold("/share [name]")} create a Seal-gated feed from this set → shareId + blobId`,
    `${c.bold("/grant <addr>")} grant a Sui address access to the last feed`,
    `${c.bold("/follow <blobId> <shareId>")}  import a shared feed into this set`,
    `${c.bold("/set <name>")}   switch knowledge set`,
    `${c.bold("/whoami")}       this agent's name + address`,
    `${c.bold("/model [id]")}   show or change the model`,
    `${c.bold("/config")}       re-enter provider / key / model`,
    `${c.bold("/help")}         this list`,
    `${c.bold("/exit")}         leave`,
  ]);
}

async function birth(): Promise<AgentIdentity> {
  info("No agent here yet — let's create one. It only needs a name.");
  const rl = rlp.createInterface({ input: process.stdin, output: process.stdout });
  let name = "";
  try {
    name = (await ask(rl, c.cyan("> ") + "name your agent ")).trim();
  } finally {
    rl.close();
  }
  const id = await createIdentity(name);
  ok(`${id.name} is born`);
  return id;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function bootPanel(rows: { label: string; value: string; ok?: boolean }[]): Promise<void> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  const width = 30;
  console.log(c.gray("> ") + c.dim("neurus init"));
  for (let i = 0; i <= width; i += 2) {
    const bar = c.magenta("█".repeat(i)) + c.dim("·".repeat(width - i));
    process.stdout.write(`  ${bar}  ${c.dim(String(Math.round((i / width) * 100)).padStart(3) + "%")}\r`);
    if (useColor) await sleep(18);
  }
  process.stdout.write("\n\n");
  const w = Math.max(...rows.map((r) => r.label.length));
  for (const r of rows) {
    const mark = r.ok === false ? c.yellow("✗") : c.green("✓");
    console.log(`  ${c.magenta("◇")} ${c.bold(r.label.padEnd(w))}  ${c.dim("│")}  ${c.gray(r.value)}  ${mark}`);
    if (useColor) await sleep(80);
  }
  console.log(`  ${c.green("✓")} ${c.green("ready")}  ${c.dim("— type")} ${c.bold("/help")} ${c.dim("or try")} ${c.bold("ask")}${c.dim(",")} ${c.bold("/recall")}${c.dim(",")} ${c.bold("/note")}\n`);
}

export async function runAgent(setName = "default"): Promise<void> {
  const fs = screen.fullscreen();

  let cfg = await loadConfig();
  if (!cfg || !cfg.apiKey) {
    if (process.env.NVIDIA_API_KEY) {
      cfg = { provider: "nvidia", apiKey: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL ?? DEFAULT_MODEL.nvidia };
    } else {
      warn("No model configured yet — let's set one up.");
      cfg = await runConfig(cfg);
    }
  }
  applyConfig(cfg);

  const identity = (await loadIdentity()) ?? (await birth());
  const tenant = tenantFor(identity);
  setBlobOwner(identity.address);

  let neurus = await Neurus.open(setName, { tenant });
  let count = 0;
  let storage = 0;
  let setsCount = 0;
  let mentions: { name: string; fileId: string; datasetId?: string }[] = [];
  let lastFeed: Feed | null = null;

  const refreshStats = async () => {
    const ns = await neurus.neurons();
    count = ns.length;
    storage = ns.reduce((s, n) => s + Buffer.byteLength(n.body ?? ""), 0);
    setsCount = (await listSets(tenant)).length;
    mentions = ns
      .filter((n) => n.type === "file")
      .map((n) => ({ name: n.title, fileId: n.id, datasetId: n.meta?.datasetId as string | undefined }));
  };
  await refreshStats();

  const headerBase = () => `${c.gray("sys")}   ${c.gray("connected to walrus")}  ${c.dim("·")}  ${c.gray("sui testnet")}  ${c.dim("·")}  ${c.gray(fmtBytes(storage))}`;
  const setHdr = (note?: string) => {
    if (fs) screen.setHeader(note ? `${headerBase()}  ${c.dim("·")}  ${c.cyan(note)}` : headerBase());
  };
  if (fs) { screen.enter(); setHdr(); } else { console.log(""); console.log(headerBase()); }

  await banner("owned, verifiable memory  ·  walrus × sui");
  await bootPanel([
    { label: "engine", value: "recall · rerank · consolidate", ok: true },
    { label: "walrus", value: "memory blobs · sui testnet", ok: true },
    { label: "identity", value: `${identity.name} · ${shortAddr(identity.address)}`, ok: true },
    { label: "agent api", value: `${cfg.provider} · ${cfg.model}`, ok: true },
    { label: "account", value: `${setsCount} set${setsCount === 1 ? "" : "s"} · ${count} ${count === 1 ? "memory" : "memories"} · ${fmtBytes(storage)}`, ok: true },
    { label: "telegram", value: "off — connect in the dashboard", ok: false },
  ]);

  const renderStatus = () => {
    const parts = [
      `${c.gray("agent")} ${c.bold(identity.name)}`,
      c.gray("testnet"),
      c.gray(`storage ${fmtBytes(storage)}`),
      c.gray(`sets ${setsCount}`),
      c.gray(`${count} ${count === 1 ? "memory" : "memories"}`),
    ];
    if (fs) screen.setStatus(c.gray(" ") + parts.join(c.gray("  ·  ")));
    else strip(parts);
  };
  renderStatus();
  if (fs) screen.toBottom();

  const completer = (line: string): [string[], string] => {
    const m = line.match(/@([^\s@]*)$/);
    if (!m) return [[], line];
    const frag = ("@" + m[1]).toLowerCase();
    const hits = mentions.map((x) => `@${x.name}`).filter((n) => n.toLowerCase().includes(frag));
    return [hits, "@" + m[1]];
  };
  const rl = rlp.createInterface({ input: process.stdin, output: process.stdout, completer });
  rl.on("SIGINT", () => { screen.exit(); rl.close(); process.exit(0); });

  let picking = false;
  readline.emitKeypressEvents(process.stdin);
  const onAt = async (str: string) => {
    if (picking || str !== "@" || (rl as { line?: string }).line !== "@") return;
    picking = true;
    rl.write(null, { ctrl: true, name: "u" });
    const others = process.stdin.listeners("keypress").filter((l) => l !== onAt);
    others.forEach((l) => process.stdin.removeListener("keypress", l as never));
    let picked: string | null = null;
    try {
      picked = await pickPath(process.cwd());
    } finally {
      others.forEach((l) => process.stdin.on("keypress", l as never));
      if (picked) {
        const root = process.cwd() + "/";
        rl.write(`@${picked.startsWith(root) ? picked.slice(root.length) : picked} `);
      }
      picking = false;
    }
  };
  process.stdin.on("keypress", onAt);
  try {
    while (true) {
      const line = (await ask(rl, c.gray("> "))).trim();
      if (!line) continue;

      if (line === "/exit" || line === "/quit") break;
      if (line === "/help") { helpBox(); continue; }

      if (line === "/whoami") {
        box("identity", [
          kvline("agent", identity.name),
          kvline("address", identity.address),
          kvline("stored", c.dim(identityPath)),
        ]);
        continue;
      }

      if (line === "/blobs" || line === "/files") {
        const all = await neurus.neurons();
        const files = all.filter((n) => n.type === "file");
        if (!files.length) { info("no files uploaded yet — use /add or @ to upload one"); continue; }
        box("uploaded blobs (Walrus)", files.map((f) => {
          const chunks = all.filter((n) => (n.meta?.file as string) === f.id).length;
          const blob = f.blobId ? `${c.green("✓")} ${c.dim("walrus")} ${f.blobId}` : c.yellow("local only");
          return `${c.bold(f.title.slice(0, 24).padEnd(24))} ${c.dim(`${chunks} chunk${chunks === 1 ? "" : "s"}`.padEnd(24))} ${blob}`;
        }));
        continue;
      }

      if (line === "/config") {
        rl.pause();
        cfg = await runConfig(cfg);
        applyConfig(cfg);
        renderStatus();
        rl.resume();
        continue;
      }

      if (line.startsWith("/model")) {
        const id = line.slice(6).trim();
        if (!id) { info(`${cfg.provider} · ${cfg.model}`); continue; }
        cfg = { ...cfg, model: id };
        await saveConfig(cfg);
        renderStatus();
        ok(`model → ${id}${cfg.provider === "nvidia" ? c.dim("  (note: NVIDIA uses its default model)") : ""}`);
        continue;
      }

      if (line.startsWith("/set")) {
        const name = line.slice(4).trim() || "default";
        try {
          neurus = await Neurus.open(name, { tenant });
          await refreshStats();
          renderStatus();
          ok(`set → ${neurus.set.name} · ${count} neurons`);
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/note")) {
        const text = line.slice(5).trim();
        if (!text) { warn("usage: /note <text>"); continue; }
        try {
          const r = await neurus.note(text);
          await refreshStats();
          renderStatus();
          ok(`remembered · people: ${r.people.map((p) => p.title).join(", ") || "—"} · commitments: ${r.commitments.length}`);
          if (r.note.blobId) info(`${c.dim("walrus blob ·")} ${r.note.blobId}`);
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/add") || line.startsWith("/ingest")) {
        const path = line.replace(/^\/(add|ingest)/, "").trim();
        if (!path) { warn("usage: /add <file-or-folder path>  — uploads to Walrus and indexes it here"); continue; }
        try {
          const st = await stat(path).catch(() => null);
          if (!st) { err(`no such file or folder: ${path}`); continue; }
          setHdr("writing to Walrus…");
          if (st.isDirectory()) {
            const r = await neurus.addDir(path, { max: 100, store: true });
            await refreshStats();
            setHdr(); renderStatus();
            ok(`added ${r.files.length} file(s) · ${r.totalChunks} chunks → "${neurus.set.name}"`);
          } else {
            const file = await neurus.addFile(path);
            await refreshStats();
            setHdr(); renderStatus();
            ok(`added ${file.title}`);
          }
          info("indexed — now just ask a question and I'll answer from it");
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line === "/publish") {
        try {
          process.stdout.write(c.dim("  publishing to Walrus…\r"));
          const blob = await neurus.publish();
          process.stdout.write("                       \r");
          ok("memory snapshot published on Walrus");
          info(`${c.dim("walrus blob ·")} ${blob}`);
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/share")) {
        const feedName = line.slice(6).trim() || neurus.set.name;
        const cfg2 = shareConfigured();
        if (!cfg2.ok) { err(`share not configured: ${cfg2.reason}`); continue; }
        try {
          process.stdout.write(c.dim("  creating feed on Sui + sealing to Walrus…\r"));
          const { shareId, capId } = await createShare(feedName, "dataset");
          const pub = await publishSealedDataset(neurus.set.name, shareId, tenant);
          lastFeed = await createFeed(tenant, { set: neurus.set.name, name: feedName, shareId, capId, blobId: pub.blobId, identity: pub.identity, neurons: pub.neurons });
          process.stdout.write("                                               \r");
          ok(`feed "${feedName}" published — ${pub.neurons} neurons sealed`);
          info(`shareId  ${c.bold(shareId)}`);
          info(`blobId   ${c.bold(pub.blobId)}`);
          info(`${c.dim("grant an address:")} /grant <0x…address>`);
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/grant")) {
        const address = line.slice(6).trim();
        if (!address) { warn("usage: /grant <0x…sui address>"); continue; }
        if (!/^0x[0-9a-fA-F]{64}$/.test(address)) { err("not a valid Sui address (needs 0x + 64 hex chars)"); continue; }
        const feed = lastFeed ?? (await listFeeds(tenant, neurus.set.name)).at(-1) ?? null;
        if (!feed) { err("no feed for this set yet — run /share first"); continue; }
        try {
          process.stdout.write(c.dim("  adding to on-chain allowlist…\r"));
          await grantReader(feed.shareId, feed.capId, address);
          process.stdout.write("                                  \r");
          ok(`granted ${address.slice(0, 8)}… access to "${feed.name}"`);
          info(`they run: neurus follow ${feed.blobId} --share ${feed.shareId}`);
          info(`or in agent: follow blobId ${feed.blobId} shareId ${feed.shareId}`);
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/follow")) {
        const parts = line.slice(7).trim().split(/\s+/);
        const blobId = parts[0];
        const shareId = parts[1];
        if (!blobId || !shareId) { warn("usage: /follow <blobId> <shareId>"); continue; }
        if (!/^0x[0-9a-fA-F]{64}$/.test(shareId)) { err("shareId must be 0x + 64 hex chars"); continue; }
        try {
          const { secretKey: keyBytes } = decodeSuiPrivateKey(identity.secretKey);
          const kp = Ed25519Keypair.fromSecretKey(keyBytes);
          const signer = { signPersonalMessage: async (msg: Uint8Array) => { const { signature } = await kp.signPersonalMessage(msg); return { signature }; } };
          process.stdout.write(c.dim("  fetching sealed blob…\r"));
          const { sealedB64 } = await fetchSealedDataset(blobId);
          process.stdout.write(c.dim("  requesting key from Seal servers…\r"));
          const plaintext = await unsealForReader(sealedB64, { shareId, address: identity.address, signer });
          const neurons = JSON.parse(plaintext) as unknown[];
          process.stdout.write("                                      \r");
          for (const n of neurons) await neurus.memory.remember(n as never);
          await neurus.flush();
          await refreshStats(); renderStatus();
          ok(`imported ${neurons.length} neurons from shared feed into "${neurus.set.name}"`);
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/recall")) {
        const q = line.slice(7).trim();
        if (!q) { warn("usage: /recall <query>"); continue; }
        try {
          const hits = await neurus.recall(q, { limit: 8 });
          if (!hits.length) { info("nothing relevant in this set"); continue; }
          for (const h of hits) {
            console.log(`  ${c.dim(h.score.toFixed(2))} ${c.bold(h.neuron.title)} ${c.dim("· " + h.neuron.body.replace(/\s+/g, " ").slice(0, 80))}`);
          }
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/plan")) {
        const goal = line.slice(5).trim();
        if (!goal) { warn("usage: /plan <goal>"); continue; }
        try {
          const hits = await neurus.recall(goal, { limit: 8 });
          const context = hits.map((h, i) => `[${i + 1}] ${h.neuron.title}: ${h.neuron.body.replace(/\s+/g, " ")}`).join("\n");
          process.stdout.write(c.dim("  planning…\r"));
          const text = await agentChat(
            cfg,
            PLAN_SYSTEM,
            `Goal: ${goal}\n\nMemory:\n${context || "(nothing relevant found)"}`,
          );
          process.stdout.write("              \r");
          console.log(c.gray("neurus ›") + " " + text.trim() + "\n");
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/")) { warn(`unknown command — try ${c.bold("/help")}`); continue; }

      // Natural language detection: follow a feed, grant access, create a feed
      {
        const shareIdMatch = line.match(/0x[0-9a-fA-F]{64}/);
        const blobIdMatch = line.match(/\b([A-Za-z0-9_-]{40,60})\b/);
        const lc = line.toLowerCase();
        const isFollow = (lc.includes("follow") || lc.includes("import") || lc.includes("subscribe")) && shareIdMatch && blobIdMatch && blobIdMatch[1] !== shareIdMatch[0];
        const isGrant = (lc.includes("grant") || lc.includes("give access") || lc.includes("allow")) && shareIdMatch;
        const isShare = (lc.includes("share") || lc.includes("create feed") || lc.includes("publish feed")) && !shareIdMatch;

        if (isFollow) {
          const blobId = blobIdMatch![1];
          const shareId = shareIdMatch![0];
          try {
            const { secretKey: keyBytes } = decodeSuiPrivateKey(identity.secretKey);
            const kp = Ed25519Keypair.fromSecretKey(keyBytes);
            const signer = { signPersonalMessage: async (msg: Uint8Array) => { const { signature } = await kp.signPersonalMessage(msg); return { signature }; } };
            process.stdout.write(c.dim("  fetching sealed blob…\r"));
            const { sealedB64 } = await fetchSealedDataset(blobId);
            process.stdout.write(c.dim("  requesting key from Seal servers…\r"));
            const plaintext = await unsealForReader(sealedB64, { shareId, address: identity.address, signer });
            const neurons = JSON.parse(plaintext) as unknown[];
            process.stdout.write("                                      \r");
            for (const n of neurons) await neurus.memory.remember(n as never);
            await neurus.flush();
            await refreshStats(); renderStatus();
            ok(`imported ${neurons.length} neurons from shared feed into "${neurus.set.name}"`);
          } catch (e) {
            err(e instanceof Error ? e.message : String(e));
          }
          continue;
        }

        if (isGrant) {
          const address = shareIdMatch![0];
          const feed = lastFeed ?? (await listFeeds(tenant, neurus.set.name)).at(-1) ?? null;
          if (!feed) { err("no feed for this set yet — run /share first"); continue; }
          try {
            process.stdout.write(c.dim("  adding to on-chain allowlist…\r"));
            await grantReader(feed.shareId, feed.capId, address);
            process.stdout.write("                                  \r");
            ok(`granted ${address.slice(0, 8)}… access to "${feed.name}"`);
            info(`they run: /follow ${feed.blobId} ${feed.shareId}`);
          } catch (e) {
            err(e instanceof Error ? e.message : String(e));
          }
          continue;
        }

        if (isShare) {
          const cfg2 = shareConfigured();
          if (!cfg2.ok) { err(`share not configured: ${cfg2.reason}`); continue; }
          try {
            process.stdout.write(c.dim("  creating feed…\r"));
            const { shareId, capId } = await createShare(neurus.set.name, "dataset");
            const pub = await publishSealedDataset(neurus.set.name, shareId, tenant);
            lastFeed = await createFeed(tenant, { set: neurus.set.name, name: neurus.set.name, shareId, capId, blobId: pub.blobId, identity: pub.identity, neurons: pub.neurons });
            process.stdout.write("                \r");
            ok(`feed published — ${pub.neurons} neurons sealed`);
            info(`shareId  ${c.bold(shareId)}`);
            info(`blobId   ${c.bold(pub.blobId)}`);
          } catch (e) {
            err(e instanceof Error ? e.message : String(e));
          }
          continue;
        }
      }

      try {
        const tokens = [...line.matchAll(/@(\S+)/g)].map((x) => x[1]);
        const scopedFileIds = new Set<string>();
        const scopedNames: string[] = [];
        for (const tok of tokens) {
          const st = await stat(resolve(tok)).catch(() => null);
          if (st?.isFile()) {
            const existing = mentions.find((m) => m.name.toLowerCase() === basename(tok).toLowerCase());
            if (existing) { scopedFileIds.add(existing.fileId); scopedNames.push(existing.name); continue; }
            try {
              const file = await neurus.addFile(resolve(tok), { store: false });
              await refreshStats();
              renderStatus();
              scopedFileIds.add(file.id);
              scopedNames.push(file.title);
              neurus.uploadFileToBlobstore(file.id, resolve(tok))
                .then((blobId) => { info(`${c.dim("walrus ·")} ${blobId}`); })
                .catch((e) => { warn(`walrus upload: ${e instanceof Error ? e.message : String(e)}`); });
            } catch (e) {
              err(`add ${basename(tok)}: ${e instanceof Error ? e.message : String(e)}`);
            }
          } else {
            const hit = mentions.find((m) => m.name.toLowerCase() === tok.toLowerCase() || m.name.toLowerCase().startsWith(tok.toLowerCase()));
            if (hit) { scopedFileIds.add(hit.fileId); scopedNames.push(hit.name); }
          }
        }
        const stripped = line.replace(/@\S+/g, "").trim();
        const question = stripped || (scopedFileIds.size ? "Summarize the key points of this file." : line);
        let hits;
        if (scopedFileIds.size) {
          if (scopedNames.length) info(`scoped to ${scopedNames.join(", ")}`);
          const all = await neurus.neurons();
          const own = all.filter((n) => scopedFileIds.has((n.meta?.file as string) ?? "") || scopedFileIds.has(n.id));
          hits = own.slice(0, 12).map((n) => ({ neuron: n, score: 1, relevance: 1 }));
        } else {
          hits = await neurus.recall(question, { limit: 6 });
        }
        process.stdout.write(c.dim("  thinking…\r"));
        const model = cfg.provider === "openrouter" ? cfg.model : undefined;
        const a = await answer(question, hits, { model });
        process.stdout.write("             \r");
        console.log(c.gray("neurus ›") + " " + a.text.trim());
        if (a.sources.length) console.log(c.dim("  sources: " + a.sources.join(", ")));
        console.log("");
      } catch (e) {
        err(e instanceof Error ? e.message : String(e));
      }
    }
  } finally {
    rl.close();
    screen.exit();
  }
  info("bye");
}

function kvline(key: string, val: string): string {
  return `${c.dim((key + ":").padEnd(10))}${val}`;
}
