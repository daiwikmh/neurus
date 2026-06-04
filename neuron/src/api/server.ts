import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Neurus, answer, listSets, createSet } from "../index";
import type { RankedNeuron } from "../core/memory";

const here = dirname(fileURLToPath(import.meta.url));

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const PORT = Number(process.env.NEURUS_API_PORT ?? 4318);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function send(res: any, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c: any) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const span = (h: RankedNeuron) => ({
  id: h.neuron.id,
  title: h.neuron.title,
  type: h.neuron.type,
  trust: h.neuron.source.trust,
  relevance: Number(h.relevance.toFixed(3)),
  score: Number(h.score.toFixed(2)),
});

async function handle(method: string, path: string, q: URLSearchParams, body: any): Promise<any> {
  if (method === "GET" && path === "/v1/health") return { ok: true, name: "neurus", version: "0.1.0" };
  if (method === "GET" && path === "/v1/sets") return { sets: await listSets() };
  if (method === "POST" && path === "/v1/sets") return { set: await createSet(String(body.name), body.visibility) };

  const setName = body.set ?? q.get("set") ?? "default";
  const nx = await Neurus.open(setName, { behind: true });

  switch (`${method} ${path}`) {
    case "POST /v1/remember":
      return nx.note(String(body.text));
    case "POST /v1/recall": {
      const hits = await nx.recall(String(body.query), { limit: body.limit ?? 8, mmr: body.mmr, type: body.type, trust: body.trust, minRelevance: body.minRelevance });
      return { hits: hits.map(span) };
    }
    case "POST /v1/retrieve":
      return { passages: await nx.retrieve(String(body.query), { topK: body.topK, minRelevance: body.minRelevance, mmr: body.mmr, type: body.type, trust: body.trust }) };
    case "POST /v1/ask": {
      const hits = await nx.recall(String(body.question), { limit: body.limit ?? 5 });
      const a = await answer(String(body.question), hits);
      return { answer: a.text, sources: a.sources, spans: hits.map(span) };
    }
    case "POST /v1/ingest/file": {
      const f = await nx.addFile(String(body.path));
      return { file: { id: f.id, title: f.title, blobId: f.blobId } };
    }
    case "POST /v1/ingest/dir":
      return nx.addDir(String(body.path), { max: body.max ?? 100 });
    case "POST /v1/ingest/walrus": {
      const s = await nx.indexWalrus(String(body.blobId), { title: body.title });
      return { source: { id: s.id, title: s.title, blobId: s.blobId } };
    }
    case "POST /v1/brief":
      return nx.brief(String(body.name));
    case "POST /v1/reflect": {
      const r = await nx.reflect();
      return { consideredNeurons: r.consideredNeurons, insights: r.insights.map((i) => ({ body: i.body, importance: i.meta?.importance })) };
    }
    case "POST /v1/surface": {
      const s = await nx.surface({ context: body.context });
      return { surfacings: s.map((x) => ({ type: x.neuron.type, body: x.neuron.body, score: Number(x.score.toFixed(2)) })) };
    }
    case "GET /v1/map": {
      await nx.memory.ready();
      const all = nx.memory.all();
      const by = (t: string) => all.filter((n) => n.type === t).length;
      return {
        set: nx.set.name,
        counts: { person: by("person"), file: by("file"), note: by("note"), chunk: by("chunk"), insight: by("insight"), commitment: by("commitment") },
        pending: nx.memory.pending(),
      };
    }
    case "GET /v1/neurons": {
      const all = await nx.neurons();
      const now = Date.now();
      return {
        set: nx.set.name,
        neurons: all
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            trust: n.source.trust,
            author: n.source.author,
            durability: (n.meta?.durability as string) ?? "confirmed",
            importance: n.meta?.importance,
            ageHours: Math.round((now - n.createdAt) / 3_600_000),
            synapses: n.synapses,
            preview: n.body.replace(/\s+/g, " ").slice(0, 140),
          })),
      };
    }
    case "POST /v1/forget":
      return { forgotten: await nx.forget(String(body.id)) };
    case "POST /v1/publish":
      return { blobId: await nx.publish(body.seal ? { sealKey: body.seal } : {}) };
    case "POST /v1/restore":
      return { restored: await nx.restore(String(body.blobId), body.seal ? { sealKey: body.seal } : {}) };
    case "POST /v1/flush":
      await nx.flush();
      return { pending: nx.memory.pending() };
    default:
      return { __notfound: true };
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const html = await readFile(join(here, "inspector.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }
  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const out = await handle(req.method ?? "GET", url.pathname, url.searchParams, body);
    if (out && out.__notfound) {
      send(res, 404, { error: `no route ${req.method} ${url.pathname}` });
      return;
    }
    send(res, 200, out);
  } catch (e: any) {
    send(res, 500, { error: e?.message ?? String(e) });
  }
});

server.listen(PORT, () => console.log(`\n  Neurus API  →  http://localhost:${PORT}/v1\n`));
