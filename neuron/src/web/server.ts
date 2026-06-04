import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Neurus } from "../index";
import { listSets } from "../core/sets";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NEURUS_WEB_PORT ?? 4317);

async function run(action: string, set: string, input: string): Promise<string> {
  if (action === "sets") {
    const sets = await listSets();
    return sets.length ? sets.map((s) => `• ${s.name} — ${s.id} (${s.visibility})`).join("\n") : "no knowledge sets yet";
  }
  const nx = await Neurus.open(set || "default", { behind: true });
  switch (action) {
    case "ask": {
      const a = await nx.ask(input);
      return a.text + (a.sources.length ? `\n\n— sources: ${a.sources.join(", ")}` : "");
    }
    case "note": {
      const r = await nx.note(input);
      return `remembered · people: ${r.people.map((p) => p.title).join(", ") || "—"} · commitments: ${r.commitments.length}`;
    }
    case "brief":
      return (await nx.brief(input)).text;
    case "index": {
      const s = await nx.indexWalrus(input.trim());
      return `indexed Walrus blob → "${s.title}" into set "${nx.set.name}"`;
    }
    case "reflect": {
      const r = await nx.reflect();
      return r.insights.length
        ? r.insights.map((i) => `★ [${((i.meta?.importance as number) ?? 0).toFixed(2)}] ${i.body}`).join("\n\n")
        : "nothing rose above the noise";
    }
    case "surface": {
      const s = await nx.surface({ context: input || undefined });
      return s.length ? s.map((x) => `→ [${x.score.toFixed(2)}] (${x.neuron.type}) ${x.neuron.body}`).join("\n\n") : "nothing worth surfacing";
    }
    case "nudges": {
      const o = await nx.nudges();
      return o.length ? o.map((c) => `• ${c.body}`).join("\n") : "no open loops";
    }
    case "map": {
      await nx.memory.ready();
      const all = nx.memory.all();
      const by = (t: string) => all.filter((n) => n.type === t).length;
      return `set "${nx.set.name}"\npeople ${by("person")} · files ${by("file")} · notes ${by("note")} · chunks ${by("chunk")} · insights ${by("insight")}`;
    }
    default:
      return `unknown action: ${action}`;
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    readFile(join(here, "index.html"), "utf8").then((html) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      try {
        const { action, set, input } = JSON.parse(raw || "{}");
        const output = await run(action ?? "ask", set ?? "default", input ?? "");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, output }));
      } catch (e: any) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, output: `error: ${e?.message ?? e}` }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => console.log(`\n  Neurus web  →  http://localhost:${PORT}\n`));
