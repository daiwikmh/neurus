import { stat } from "node:fs/promises";
import { Neurus } from "../src/index";
import { listSets } from "../src/core/sets";
import { runAgent, runConfig } from "../src/cli/agent";
import { loadConfig } from "../src/cli/config";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

function parseFlags(args: string[]): { set?: string; seal?: string; rest: string[] } {
  const rest: string[] = [];
  let set: string | undefined;
  let seal: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--set") { set = args[++i]; continue; }
    if (args[i] === "--seal") { seal = args[++i]; continue; }
    rest.push(args[i]);
  }
  return { set, seal, rest };
}

function usage() {
  console.log(`neurus — AI intelligence layer over Walrus data

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

  flags: --set <name>  (default "default") · --seal <key>  (publish/restore)`);
}

async function main() {
  const [cmd, ...raw] = process.argv.slice(2);
  const { set: setName, seal, rest } = parseFlags(raw);
  const arg = rest.join(" ").trim();

  if (!cmd || cmd === "agent" || cmd === "chat") {
    await runAgent(setName ?? "default");
    return;
  }
  if (cmd === "config") {
    await runConfig(await loadConfig());
    return;
  }

  if (cmd === "sets") {
    const sets = await listSets();
    if (!sets.length) { console.log("no knowledge sets yet"); return; }
    for (const s of sets) console.log(`  ${s.name.padEnd(20)} ${s.id} · ${s.visibility}${s.sharedWith.length ? ` · shared with ${s.sharedWith.join(", ")}` : ""}`);
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
    default:
      usage();
  }
}

main().catch((e) => { console.error("❌", e.message ?? e); process.exit(1); });
