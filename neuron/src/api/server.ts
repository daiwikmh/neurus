import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Neurus, answer, answerStream, listSets, createSet, Vault, AccountManager, localTenant, safeTenantId, getWidget, getChatBinding, bindChat, sendTelegram, envCredentials, type Tenant } from "../index";
import type { RankedNeuron } from "../core/memory";
import { warmup } from "../retrieval/rerank";
import { NetHub } from "../net/hub";
import type { Op } from "../crdt/oplog";
import { MemwalStore } from "../storage/memwal";
import { WorkflowRunner, type WorkflowConfig } from "../net/workflow";
import { compileWorkflow } from "../net/compile";

const here = dirname(fileURLToPath(import.meta.url));
const vault = new Vault();
const accounts = new AccountManager(vault);

const memIndex = new Map<string, MemwalStore>();
const net = new NetHub(async (setId, neuron) => {
  let store = memIndex.get(setId);
  if (!store) {
    store = new MemwalStore(`net_${setId}`);
    memIndex.set(setId, store);
  }
  await store.remember((neuron.meta?.embedText as string | undefined) ?? neuron.body);
});

const workflows = new Map<string, WorkflowRunner>();

async function resolveTenant(userId?: string): Promise<Tenant> {
  if (!userId) return localTenant();
  const id = safeTenantId(userId);
  const credentials = await vault.get(id);
  return { id, root: join(".neurus-data", id), credentials };
}

async function tenantById(id: string): Promise<Tenant> {
  if (id === "local") return localTenant();
  const credentials = await vault.get(id);
  return { id, root: join(".neurus-data", id), credentials };
}

const rate = new Map<string, number[]>();
function allowRate(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (rate.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    rate.set(key, hits);
    return false;
  }
  hits.push(now);
  rate.set(key, hits);
  return true;
}

function originAllowed(origin: string, allow: string[]): boolean {
  if (allow.length === 0 || !origin) return true;
  try {
    const host = new URL(origin).host;
    return allow.some((a) => a === origin || a === host || host.endsWith(a.replace(/^https?:\/\//, "")));
  } catch {
    return false;
  }
}

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const PORT = Number(process.env.PORT ?? process.env.NEURUS_API_PORT ?? 4318);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-neurus-user",
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
  preview: h.neuron.body.replace(/\s+/g, " ").slice(0, 180),
});

async function handle(method: string, path: string, q: URLSearchParams, body: any, tenant: Tenant): Promise<any> {
  if (method === "GET" && path === "/v1/health") return { ok: true, name: "neurus", version: "0.1.0", tenant: tenant.id };
  if (method === "GET" && path === "/v1/sets") return { sets: await listSets(tenant) };
  if (method === "POST" && path === "/v1/sets") return { set: await createSet(String(body.name), body.visibility, tenant) };

  if (method === "GET" && path === "/v1/account") {
    if (tenant.id === "local") return { linked: false, owned: false, local: true };
    return accounts.status(tenant.id);
  }
  if (method === "POST" && path === "/v1/account/link") {
    if (tenant.id === "local") throw new Error("connect a wallet before linking an account");
    return accounts.link(tenant.id, { accountId: String(body.accountId), delegateKey: String(body.delegateKey), serverUrl: body.serverUrl });
  }
  if (method === "POST" && path === "/v1/account/provision") {
    if (tenant.id === "local") throw new Error("connect a wallet before provisioning an account");
    return accounts.provisionAndLink(tenant.id);
  }
  if (method === "POST" && path === "/v1/account/adopt-env") {
    if (tenant.id === "local") throw new Error("connect a wallet first");
    const creds = envCredentials();
    if (!creds) throw new Error("no env MemWal account configured (MEMWAL_ACCOUNT_ID / MEMWAL_DELEGATE_KEY)");
    return accounts.link(tenant.id, creds);
  }
  if (method === "POST" && path === "/v1/account/unlink") {
    if (tenant.id === "local") return { unlinked: false };
    return accounts.unlink(tenant.id);
  }

  if (method === "POST" && path === "/v1/net/op") return net.submit(String(body.set ?? "default"), body.op as Op);
  if (method === "GET" && path === "/v1/net/state") return net.snapshot(q.get("set") ?? "default");
  if (method === "GET" && path === "/v1/net/ops") return { ops: net.opsSince(q.get("set") ?? "default", Number(q.get("since") ?? 0)) };
  if (method === "POST" && path === "/v1/net/grant") {
    net.grant(String(body.set ?? "default"), String(body.actor), String(body.secret), body.can === "read" ? "read" : "write");
    return net.snapshot(String(body.set ?? "default"));
  }
  if (method === "POST" && path === "/v1/net/revoke") {
    net.revoke(String(body.set ?? "default"), String(body.actor));
    return net.snapshot(String(body.set ?? "default"));
  }
  if (method === "POST" && path === "/v1/net/checkpoint") return { checkpointed: await net.checkpoint() };
  if (method === "POST" && path === "/v1/net/seed") {
    const seedSet = String(body.set ?? "default");
    const nx = await Neurus.open(seedSet, { tenant });
    const added = await net.seed(seedSet, await nx.neurons());
    return { added, ...net.snapshot(seedSet) };
  }
  if (method === "POST" && path === "/v1/net/compile") {
    const sets = (await listSets(tenant)).map((s) => s.name);
    return { spec: await compileWorkflow(String(body.prompt ?? ""), { sets }) };
  }
  if (method === "POST" && path === "/v1/net/workflow") {
    const wfSet = String(body.set ?? "default");
    workflows.get(wfSet)?.stop();
    const token = process.env.TELEGRAM_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const protocols = Array.isArray(body.protocols) ? body.protocols.map(String) : Array.isArray(body.feeds) ? body.feeds.map(String) : [];
    const assets = Array.isArray(body.assets) ? body.assets.map(String) : [];
    const cfg: WorkflowConfig = {
      set: wfSet,
      feeds: protocols.length || assets.length ? protocols : ["aave", "uniswap", "lido"],
      assets,
      intervalMs: Math.max(2000, Number(body.intervalMs ?? 5000)),
      threshold: Number(body.threshold ?? 0.5),
      reportEvery: Math.max(1, Number(body.reportEvery ?? 3)),
      strategySet: body.strategySet ? String(body.strategySet) : undefined,
      instruction: body.instruction ? String(body.instruction) : undefined,
      durationDays: body.durationDays ? Number(body.durationDays) : undefined,
      telegram: token && chatId ? { token, chatId } : undefined,
      autoReport: body.telegram !== false,
      tenant,
    };
    const wf = new WorkflowRunner(net, cfg);
    workflows.set(wfSet, wf);
    wf.start();
    return wf.status();
  }
  if (method === "POST" && path === "/v1/net/workflow/stop") {
    const wfSet = String(body.set ?? "default");
    workflows.get(wfSet)?.stop();
    return workflows.get(wfSet)?.status() ?? { running: false, set: wfSet, feeds: [], assets: [], intervalMs: 0, threshold: 0, ticks: 0 };
  }
  if (method === "GET" && path === "/v1/net/workflow") {
    const wfSet = q.get("set") ?? "default";
    return workflows.get(wfSet)?.status() ?? { running: false, set: wfSet, feeds: [], assets: [], intervalMs: 0, threshold: 0, ticks: 0 };
  }
  if (method === "POST" && path === "/v1/net/workflow/report") {
    const wfSet = String(body.set ?? "default");
    const wf = workflows.get(wfSet);
    if (!wf) return { sent: false, error: "no running workflow for this set" };
    return wf.report();
  }

  const setName = body.set ?? q.get("set") ?? "default";
  const nx = await Neurus.open(setName, { behind: true, tenant });

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
      const { surfacings, delivered } = await nx.surfaceAndNotify({ context: body.context, notify: body.notify });
      return { surfacings: surfacings.map((x) => ({ type: x.neuron.type, body: x.neuron.body, score: Number(x.score.toFixed(2)) })), delivered };
    }
    case "GET /v1/notify":
      return { config: await nx.notifyConfig() };
    case "POST /v1/notify/telegram":
      return { config: await nx.connectTelegram(String(body.chatId)) };
    case "POST /v1/notify/test":
      return nx.notify(String(body.text ?? "✅ Neurus is connected. You'll get nudges here."));
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
    case "GET /v1/datasets":
      return { datasets: await nx.datasets() };
    case "POST /v1/datasets/upload":
      return { dataset: (await nx.addUpload(String(body.name), String(body.content))).dataset };
    case "POST /v1/datasets/publish":
      return { dataset: await nx.publishDataset(body.seal ? { sealKey: body.seal } : {}) };
    case "POST /v1/datasets/import":
      return { dataset: await nx.importDataset(String(body.blobId), body.title) };
    case "POST /v1/datasets/web":
      return nx.addSite(String(body.url), { max: body.max, pathPrefix: body.pathPrefix });
    case "POST /v1/datasets/github":
      return nx.addRepo(String(body.repo), { max: body.max });
    case "POST /v1/datasets/folder":
      return nx.addFolder(String(body.name), body.files ?? []);
    case "POST /v1/datasets/health":
      return { health: await nx.datasetHealth(String(body.objectId)) };
    case "POST /v1/datasets/renew":
      return { dataset: await nx.renewDataset(String(body.id), body.epochs) };
    case "GET /v1/widgets":
      return { widgets: await nx.widgets() };
    case "POST /v1/widgets":
      return { widget: await nx.createWidget(String(body.name), body.origins ?? []) };
    case "POST /v1/widgets/delete":
      return { deleted: await nx.deleteWidget(String(body.id)) };
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

async function handleTelegramUpdate(update: any): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_TOKEN;
  if (!token) return;
  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
  const text = typeof msg?.text === "string" ? msg.text.trim() : "";
  if (!chatId || !text) return;
  const reply = (t: string) => sendTelegram({ token, chatId }, t).catch(() => {});

  const binding = await getChatBinding(chatId);
  if (!binding) {
    await reply(`This chat isn't linked yet.\nOpen Neurus → profile → Telegram, paste this chat id (${chatId}), and connect.`);
    return;
  }
  const tenant = await tenantById(binding.user);

  if (text === "/start" || text === "/help") {
    await reply(`Ask me anything about your memory "${binding.set}".\n\nCommands:\n/sets — list your sets\n/use <name> — switch the set I answer from`);
    return;
  }
  if (text === "/sets") {
    const sets = await listSets(tenant);
    await reply(sets.length ? "Your sets:\n" + sets.map((s) => `• ${s.name}`).join("\n") : "No sets yet.");
    return;
  }
  if (text.toLowerCase().startsWith("/use ")) {
    const name = text.slice(5).trim();
    const sets = await listSets(tenant);
    const found = sets.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!found) {
      await reply(`No set named "${name}". Send /sets to list yours.`);
      return;
    }
    await bindChat(chatId, { user: binding.user, set: found.name });
    await reply(`Now talking to "${found.name}".`);
    return;
  }

  try {
    const nx = await Neurus.open(binding.set, { behind: true, tenant });
    const hits = await nx.recall(text, { limit: 5 });
    const a = await answer(text, hits);
    await reply(a.text?.trim() || "I couldn't find anything in your memory about that.");
  } catch {
    await reply("Something went wrong answering that. Try again in a moment.");
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
  if (req.method === "GET" && url.pathname === "/v1/net/stream") {
    const set = url.searchParams.get("set")?.trim() || "default";
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS });
    const sse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    sse("state", net.snapshot(set));
    const unsub = net.subscribe(set, (event, data) => sse(event, data));
    req.on("close", () => unsub());
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/public/widget") {
    const w = await getWidget(url.searchParams.get("id")?.trim() ?? "");
    if (!w) { send(res, 404, { error: "unknown widget" }); return; }
    send(res, 200, { id: w.id, name: w.name });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/public/ask/stream") {
    try {
      const body = await readBody(req);
      const w = await getWidget(String(body.widget ?? ""));
      if (!w) { send(res, 404, { error: "unknown widget" }); return; }
      const origin = (req.headers.origin as string) || (req.headers.referer as string) || "";
      if (!originAllowed(origin, w.origins)) { send(res, 403, { error: "origin not allowed for this widget" }); return; }
      if (!allowRate(w.id)) { send(res, 429, { error: "rate limit exceeded, slow down" }); return; }
      const tenant = await tenantById(w.tenantId);
      const nx = await Neurus.open(w.set, { behind: true, tenant });
      const hits = await nx.recall(String(body.question), { limit: 5 });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS });
      const sse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      sse("spans", { spans: hits.map(span) });
      const a = await answerStream(String(body.question), hits, (t) => sse("token", { t }));
      sse("done", { answer: a.text, sources: a.sources });
      res.end();
    } catch (e: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: e?.message ?? String(e) })}\n\n`);
      res.end();
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/ask/stream") {
    try {
      const body = await readBody(req);
      const tenant = await resolveTenant((req.headers["x-neurus-user"] as string | undefined)?.trim() || undefined);
      const nx = await Neurus.open(body.set ?? "default", { behind: true, tenant });
      const hits = await nx.recall(String(body.question), { limit: body.limit ?? 5 }).catch(() => nx.recall(String(body.question), { limit: body.limit ?? 5 }));
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS });
      const sse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      sse("spans", { spans: hits.map(span) });
      const a = await answerStream(String(body.question), hits, (t) => sse("token", { t }));
      sse("done", { answer: a.text, sources: a.sources });
      res.end();
    } catch (e: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: e?.message ?? String(e) })}\n\n`);
      res.end();
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/telegram/webhook") {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
      send(res, 401, { ok: false });
      return;
    }
    const update = await readBody(req);
    send(res, 200, { ok: true }); // ack Telegram fast; process out of band
    handleTelegramUpdate(update).catch(() => {});
    return;
  }
  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const tenant = await resolveTenant((req.headers["x-neurus-user"] as string | undefined)?.trim() || undefined);
    const out = await handle(req.method ?? "GET", url.pathname, url.searchParams, body, tenant);
    if (out && out.__notfound) {
      send(res, 404, { error: `no route ${req.method} ${url.pathname}` });
      return;
    }
    send(res, 200, out);
  } catch (e: any) {
    send(res, 500, { error: e?.message ?? String(e) });
  }
});

async function boot() {
  try {
    const restored = await net.restore();
    if (restored.length) console.log(`  restored ${restored.length} net set(s) from Walrus`);
  } catch {
    console.log("  net restore skipped");
  }
  setInterval(() => {
    net.checkpoint().catch(() => {});
  }, 15_000);
  server.listen(PORT, () => {
    console.log(`\n  Neurus API  →  http://localhost:${PORT}/v1\n`);
    warmup()
      .then(() => console.log("  reranker warm — first Ask is instant"))
      .catch(() => console.log("  reranker warmup skipped (will load on first Ask)"));
  });
}
boot();
