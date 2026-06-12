import * as readline from "node:readline";
import * as rlp from "node:readline/promises";
import { Neurus, answer } from "../index";
import { orChat } from "../llm/openrouter";
import { chat as nvidiaChat } from "../llm/nvidia";
import { banner, box, c, info, ok, warn, err } from "./ui";
import { loadConfig, saveConfig, applyConfig, configPath, DEFAULT_MODEL, type CliConfig, type Provider } from "./config";

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
    const p = (await ask(rl, c.cyan(`provider [nvidia/openrouter] (${provider}) › `))).trim().toLowerCase();
    if (p === "nvidia" || p === "openrouter") provider = p;

    const key = await askHidden(c.cyan(`${provider} API key › `));
    if (!key) throw new Error("an API key is required");

    const defModel = existing?.provider === provider ? existing.model : DEFAULT_MODEL[provider];
    const m = (await ask(rl, c.cyan(`model (${defModel}) › `))).trim();
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
    `${c.bold("/set <name>")}   switch knowledge set`,
    `${c.bold("/model [id]")}   show or change the model`,
    `${c.bold("/config")}       re-enter provider / key / model`,
    `${c.bold("/help")}         this list`,
    `${c.bold("/exit")}         leave`,
  ]);
}

export async function runAgent(setName = "default"): Promise<void> {
  let cfg = await loadConfig();
  if (!cfg || !cfg.apiKey) {
    banner();
    warn("No agent configured yet — let's set one up.");
    cfg = await runConfig(cfg);
  }
  applyConfig(cfg);

  let neurus = await Neurus.open(setName);
  let count = (await neurus.neurons()).length;

  banner();
  box("neurus agent", [
    kvline("set", neurus.set.name),
    kvline("memory", `${count} neurons`),
    kvline("provider", cfg.provider),
    kvline("model", cfg.model),
  ]);
  info(`type ${c.bold("/help")} for commands · ${c.bold("/exit")} to leave`);
  console.log("");

  const rl = rlp.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = (await ask(rl, c.cyan("you › "))).trim();
      if (!line) continue;

      if (line === "/exit" || line === "/quit") break;
      if (line === "/help") { helpBox(); continue; }

      if (line === "/config") {
        rl.pause();
        cfg = await runConfig(cfg);
        applyConfig(cfg);
        rl.resume();
        continue;
      }

      if (line.startsWith("/model")) {
        const id = line.slice(6).trim();
        if (!id) { info(`${cfg.provider} · ${cfg.model}`); continue; }
        cfg = { ...cfg, model: id };
        await saveConfig(cfg);
        ok(`model → ${id}${cfg.provider === "nvidia" ? c.dim("  (note: NVIDIA uses its default model)") : ""}`);
        continue;
      }

      if (line.startsWith("/set")) {
        const name = line.slice(4).trim() || "default";
        try {
          neurus = await Neurus.open(name);
          count = (await neurus.neurons()).length;
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
          count = (await neurus.neurons()).length;
          ok(`remembered · people: ${r.people.map((p) => p.title).join(", ") || "—"} · commitments: ${r.commitments.length}`);
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
          console.log(c.magenta("neurus ›") + " " + text.trim() + "\n");
        } catch (e) {
          err(e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      if (line.startsWith("/")) { warn(`unknown command — try ${c.bold("/help")}`); continue; }

      try {
        const hits = await neurus.recall(line, { limit: 6 });
        process.stdout.write(c.dim("  thinking…\r"));
        const model = cfg.provider === "openrouter" ? cfg.model : undefined;
        const a = await answer(line, hits, { model });
        process.stdout.write("             \r");
        console.log(c.magenta("neurus ›") + " " + a.text.trim());
        if (a.sources.length) console.log(c.dim("  sources: " + a.sources.join(", ")));
        console.log("");
      } catch (e) {
        err(e instanceof Error ? e.message : String(e));
      }
    }
  } finally {
    rl.close();
  }
  info("bye");
}

function kvline(key: string, val: string): string {
  return `${c.dim((key + ":").padEnd(10))}${val}`;
}
