import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Neurus, answer, answerStream, listSets, createSet, Vault, AccountManager, localTenant, safeTenantId, getWidget, getChatBinding, bindChat, sendTelegram, connectTelegram, getNotifyConfig, mintLinkToken, consumeLinkToken, envCredentials, type Tenant } from "../index";
import type { RankedNeuron } from "../core/memory";
import { warmup, rerank } from "../retrieval/rerank";
import { NetHub } from "../net/hub";
import type { Op } from "../crdt/oplog";
import { MemwalStore } from "../storage/memwal";
import { WorkflowRunner, price, type WorkflowConfig } from "../net/workflow";
import { compileWorkflow } from "../net/compile";
import { saveRecords, loadRecords, type WorkflowRecord } from "../net/wfpersist";
import { publishSealedDataset, fetchSealedDataset } from "../net/share";
import { createShare, grantReader, revokeReader, shareConfigured } from "../net/share-chain";
import { createFeed, listFeeds, getFeed, deleteFeed, addGrant, removeGrant } from "../core/feeds";
import { createAgent, listAgents, deleteAgent, getAgentById, type AgentInput } from "../core/agents";
import { buildAgentCard, textFromMessage, jsonrpcResult, jsonrpcError } from "../net/a2a";
import { playMath, describeClose, fmtPrice, type PlayMeta } from "../net/plays";
import { SharedReplica } from "../crdt/replica";
import { Capabilities } from "../crdt/oplog";
import { createNeuron } from "../core/neuron";
import { chat } from "../llm/nvidia";
import { scopeKey } from "../net/scope";
import { extractMeeting } from "../ingest/meeting";
import { isPaid, markPaid } from "../billing/store";
import { verifyPayment, priceSui, priceUsd, treasury, billingConfigured } from "../billing/sui";

const PAID_RATE_MAX = Number(process.env.PAID_RATE_PER_MIN ?? 15);

// Resolve the model to use for an answer. Empty -> free NVIDIA default. A chosen model is
// the paid OpenRouter path: requires an unlocked tenant and is rate-capped per user.
async function gateModel(tenant: Tenant, requested: unknown): Promise<string | undefined> {
  const model = String(requested ?? "").trim();
  if (!model) return undefined;
  if (!(await isPaid(tenant.id))) throw new Error("This model requires unlocking — pay to use models beyond the free default.");
  if (!allowRate(`paid:${tenant.id}`, PAID_RATE_MAX, 60_000)) throw new Error("Slow down — too many premium model requests this minute.");
  return model;
}

const here = dirname(fileURLToPath(import.meta.url));
const vault = new Vault();
const accounts = new AccountManager(vault);

const memIndex = new Map<string, MemwalStore>();
function netStore(setId: string): MemwalStore {
  let store = memIndex.get(setId);
  if (!store) {
    store = new MemwalStore(`net_${setId}`);
    memIndex.set(setId, store);
  }
  return store;
}
const indexQueue: { setId: string; text: string }[] = [];
let indexDraining = false;
async function drainIndex(): Promise<void> {
  if (indexDraining) return;
  indexDraining = true;
  while (indexQueue.length) {
    const { setId, text } = indexQueue.shift()!;
    try {
      await netStore(setId).rememberAsync(text);
    } catch (e) {
      console.error("net index:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  indexDraining = false;
}
const net = new NetHub(async (setId, neuron) => {
  indexQueue.push({ setId, text: (neuron.meta?.embedText as string | undefined) ?? neuron.body });
  void drainIndex();
});

const workflows = new Map<string, WorkflowRunner>();
const wfRecords = new Map<string, WorkflowRecord>();

function persistWorkflows(): void {
  saveRecords([...wfRecords.values()]).catch((e) => console.error("wf persist:", (e as Error).message));
}

function recordFromConfig(set: string, tenantId: string, cfg: WorkflowConfig, endsAt: number): WorkflowRecord {
  const { telegram: _t, tenant: _u, set: _s, netKey: _n, ...spec } = cfg;
  return {
    id: `wf_${Math.random().toString(16).slice(2, 14)}`,
    set,
    tenantId,
    spec,
    cursor: { ticksDone: 0, lastTickAt: Date.now() },
    startedAt: Date.now(),
    endsAt,
    status: "active",
  };
}

function envTelegram(): { token: string; chatId: string } | undefined {
  const token = process.env.TELEGRAM_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : undefined;
}

// Telegram target for a workflow: prefer the explicit env chat id, else fall back to the
// chat the tenant connected in the dashboard (so "Connect Telegram" drives reports too).
async function tenantTelegram(tenant: Tenant): Promise<{ token: string; chatId: string } | undefined> {
  const env = envTelegram();
  if (env) return env;
  const token = process.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_TOKEN;
  if (!token) return undefined;
  const cfg = await getNotifyConfig(tenant);
  return cfg.telegram?.chatId ? { token, chatId: cfg.telegram.chatId } : undefined;
}

function signedReplica(set: string, actor: string, secret: string): SharedReplica {
  net.grant(set, actor, secret, "write");
  const r = new SharedReplica(actor, secret, new Capabilities());
  r.receive(net.opsSince(set, 0));
  return r;
}

const POSTMORTEM_SYSTEM = `You write a 2-3 sentence post-mortem of a closed trading play from the FACTS given.
State what happened and one concrete lesson for next time. Use only the numbers given — never recompute or invent any. No preamble.`;

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
  if (method === "GET" && path === "/v1/account/delegate-pubkey") {
    if (tenant.id === "local") throw new Error("no delegate key for local tenant");
    return { pubkey: await accounts.getDelegatePublicKey(tenant.id) };
  }
  if (method === "POST" && path === "/v1/account/relink") {
    if (tenant.id === "local") throw new Error("connect a wallet before relinking");
    return accounts.relink(tenant.id, String(body.delegateKey));
  }

  if (method === "POST" && path === "/v1/extract/meeting") {
    try {
      return await extractMeeting(String(body.text ?? ""));
    } catch {
      return { isMeeting: false, title: "", start: null, end: null, attendees: [] };
    }
  }

  if (method === "GET" && path === "/v1/billing/status") {
    const paid = await isPaid(tenant.id);
    if (!billingConfigured()) return { paid, configured: false, priceUsd: priceUsd() };
    let sui: number | null = null;
    try { sui = await priceSui(); } catch { sui = null; }
    return { paid, configured: true, priceUsd: priceUsd(), priceSui: sui, treasury: treasury() };
  }
  if (method === "POST" && path === "/v1/billing/verify") {
    if (tenant.id === "local") throw new Error("connect a wallet to unlock models");
    if (await isPaid(tenant.id)) return { paid: true, already: true };
    const digest = String(body.txDigest ?? "").trim();
    if (!digest) throw new Error("txDigest required");
    const r = await verifyPayment(digest, tenant.id);
    if (!r.ok) throw new Error(r.reason ?? "payment could not be verified");
    await markPaid(tenant.id, { txDigest: digest, amountSui: r.amountSui });
    return { paid: true, amountSui: r.amountSui };
  }

  if (method === "POST" && path === "/v1/net/op") return net.submit(scopeKey(tenant.id, String(body.set ?? "default")), body.op as Op);
  if (method === "GET" && path === "/v1/net/state") return net.snapshot(scopeKey(tenant.id, q.get("set") ?? "default"));
  if (method === "GET" && path === "/v1/net/ops") return { ops: net.opsSince(scopeKey(tenant.id, q.get("set") ?? "default"), Number(q.get("since") ?? 0)) };
  if (method === "POST" && path === "/v1/net/grant") {
    const key = scopeKey(tenant.id, String(body.set ?? "default"));
    net.grant(key, String(body.actor), String(body.secret), body.can === "read" ? "read" : "write");
    return net.snapshot(key);
  }
  if (method === "POST" && path === "/v1/net/revoke") {
    const key = scopeKey(tenant.id, String(body.set ?? "default"));
    net.revoke(key, String(body.actor));
    return net.snapshot(key);
  }
  if (method === "POST" && path === "/v1/net/checkpoint") return { checkpointed: await net.checkpoint() };
  if (method === "POST" && path === "/v1/net/seed") {
    const seedName = String(body.set ?? "default");
    const seedKey = scopeKey(tenant.id, seedName);
    const nx = await Neurus.open(seedName, { tenant });
    const added = await net.seed(seedKey, await nx.neurons());
    return { added, ...net.snapshot(seedKey) };
  }
  if (method === "POST" && path === "/v1/net/ask") {
    const askSet = scopeKey(tenant.id, String(body.set ?? "default"));
    const question = String(body.question ?? "").trim();
    if (!question) throw new Error("question required");
    const snap = net.snapshot(askSet);
    const byText = new Map(snap.neurons.map((n) => [(n.meta?.embedText as string | undefined) ?? n.body, n]));
    let hits: { text: string }[] = [];
    try {
      hits = await netStore(askSet).recall(question, 24);
    } catch {
      hits = [];
    }
    const seen = new Set<string>();
    const pool: typeof snap.neurons = [];
    for (const h of hits) {
      const n = byText.get(h.text);
      if (n && !seen.has(n.id)) {
        seen.add(n.id);
        pool.push(n);
      }
    }
    const model = await gateModel(tenant, body.model);
    const ranked = await rerank(question, pool.map((n) => `${n.title}\n${n.body}`));
    const cands = ranked.slice(0, 8).map((r) => ({ neuron: pool[r.index], score: r.score, relevance: 1 / (1 + Math.exp(-r.score)) }));
    const ans = await answer(question, cands, { floor: Number(process.env.NEURUS_NET_ASK_FLOOR ?? -11), model });
    return {
      ...ans,
      spans: cands.map((c) => ({
        id: c.neuron.id,
        title: c.neuron.title,
        author: c.neuron.source.author,
        score: Number(c.score.toFixed(2)),
        relevance: Number(c.relevance.toFixed(2)),
        ageHours: Math.round((Date.now() - c.neuron.createdAt) / 3_600_000),
        preview: c.neuron.body.replace(/\s+/g, " ").slice(0, 140),
      })),
    };
  }
  if (method === "POST" && path === "/v1/net/play") {
    const playSet = scopeKey(tenant.id, String(body.set ?? "default"));
    const asset = String(body.asset ?? "").trim().toLowerCase();
    const entry = Number(body.entry);
    if (!asset || !Number.isFinite(entry) || entry <= 0) throw new Error("asset and a positive entry price are required");
    const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
    const meta: PlayMeta = {
      kind: "play",
      asset,
      direction: body.direction === "short" ? "short" : "long",
      entry,
      target: num(body.target),
      stop: num(body.stop),
      thesis: body.thesis ? String(body.thesis) : undefined,
      status: "open",
      openedAt: Date.now(),
    };
    const text = `${asset.toUpperCase()} ${meta.direction} @ ${fmtPrice(entry)}${meta.target ? `, target ${fmtPrice(meta.target)}` : ""}${meta.stop ? `, stop ${fmtPrice(meta.stop)}` : ""}${meta.thesis ? ` — ${meta.thesis}` : ""}`;
    const n = createNeuron({ type: "note", title: `Play: ${asset.toUpperCase()} ${meta.direction}`, body: text, author: "self", meta: meta as unknown as Record<string, unknown> });
    const res = await net.submit(playSet, signedReplica(playSet, "self", `owner:${playSet}`).add(n));
    if (!res.ok) throw new Error(res.reason ?? "play rejected");
    return { play: n, ...net.snapshot(playSet) };
  }
  if (method === "POST" && path === "/v1/net/play/close") {
    const playSet = scopeKey(tenant.id, String(body.set ?? "default"));
    const playId = String(body.playId ?? "");
    const play = net.snapshot(playSet).neurons.find((n) => n.id === playId && (n.meta as Record<string, unknown> | undefined)?.kind === "play");
    if (!play) throw new Error("play not found");
    const meta = play.meta as unknown as PlayMeta;
    if (meta.status === "closed") throw new Error("play already closed");
    const exit = Number.isFinite(Number(body.exit)) && Number(body.exit) > 0 ? Number(body.exit) : await price(meta.asset);
    if (exit == null) throw new Error(`no exit price available for ${meta.asset}`);
    const sign = meta.direction === "long" ? 1 : -1;
    const plPct = Number((((exit - meta.entry) / meta.entry) * 100 * sign).toFixed(2));
    const closed = { ...play, body: describeClose(meta, exit), meta: { ...meta, status: "closed", exit, closedAt: Date.now(), plPct } as unknown as Record<string, unknown> };
    const res = await net.submit(playSet, signedReplica(playSet, "self", `owner:${playSet}`).update(closed));
    if (!res.ok) throw new Error(res.reason ?? "close rejected");
    const m = playMath(meta, exit);
    const facts = `${describeClose(meta, exit)}${meta.stop != null ? `; stop was ${fmtPrice(meta.stop)}${m.hitStop ? " (hit)" : " (not hit)"}` : ""}${meta.target != null ? `; target was ${fmtPrice(meta.target)}${m.hitTarget ? " (hit)" : " (not hit)"}` : ""}${meta.thesis ? `; thesis: ${meta.thesis}` : ""}`;
    let lesson = facts;
    try {
      lesson = (await chat(POSTMORTEM_SYSTEM, facts, { maxTokens: 180 })).trim() || facts;
    } catch {
      void 0;
    }
    const pm = createNeuron({
      type: "insight",
      title: `Post-mortem: ${meta.asset.toUpperCase()} ${meta.direction}`,
      body: lesson,
      author: "analyst",
      meta: { kind: "postmortem", playId, exit, plPct, hitStop: m.hitStop, hitTarget: m.hitTarget },
    });
    await net.submit(playSet, signedReplica(playSet, "analyst", "analyst-secret").add(pm));
    return { closed, postmortem: pm, ...net.snapshot(playSet) };
  }
  if (method === "GET" && path === "/v1/net/plays") {
    const playSet = scopeKey(tenant.id, q.get("set") ?? "default");
    const all = net.snapshot(playSet).neurons.filter((n) => (n.meta as Record<string, unknown> | undefined)?.kind === "play");
    const openAssets = [...new Set(all.filter((n) => (n.meta as unknown as PlayMeta).status === "open").map((n) => (n.meta as unknown as PlayMeta).asset))];
    const priced = new Map(await Promise.all(openAssets.map(async (a) => [a, await price(a)] as const)));
    return {
      plays: all
        .map((n) => {
          const meta = n.meta as unknown as PlayMeta;
          const current = meta.status === "open" ? priced.get(meta.asset) ?? null : null;
          const math = current != null ? playMath(meta, current) : null;
          return {
            id: n.id,
            ...meta,
            current,
            plPct: meta.status === "closed" ? meta.plPct : math ? Number(math.plPct.toFixed(2)) : undefined,
            distToStop: math?.distToStop != null ? Number(math.distToStop.toFixed(2)) : undefined,
            distToTarget: math?.distToTarget != null ? Number(math.distToTarget.toFixed(2)) : undefined,
          };
        })
        .sort((a, b) => (a.status === b.status ? b.openedAt - a.openedAt : a.status === "open" ? -1 : 1)),
    };
  }
  if (method === "POST" && path === "/v1/share/snapshot") {
    const snapSet = String(body.set ?? "default");
    const nx = await Neurus.open(snapSet, { tenant });
    const neurons = await nx.neurons();
    const { blobId } = await import("../storage/walrus").then((m) => m.putBlobInfo(JSON.stringify(neurons)));
    return { blobId, neurons: neurons.length };
  }
  if (method === "POST" && path === "/v1/share/snapshot/import") {
    const intoSet = String(body.set ?? "default");
    const blobId = String(body.blobId ?? "");
    if (!blobId) throw new Error("blobId required");
    const text = await import("../storage/walrus").then((m) => m.getBlobText(blobId));
    const neurons = JSON.parse(text) as { id: string }[];
    const nx = await Neurus.open(intoSet, { tenant });
    let imported = 0;
    for (const n of neurons) { await nx.memory.remember(n as never); imported++; }
    return { imported };
  }
  if (method === "POST" && path === "/v1/share/publish") {
    const shareSet = String(body.set ?? "default");
    const shareId = String(body.shareId ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(shareId)) throw new Error("shareId must be a 0x-prefixed Share object id (create one on-chain via neurus_share::share::create)");
    return publishSealedDataset(shareSet, shareId, tenant);
  }
  if (method === "GET" && path === "/v1/share/inspect") {
    const blobId = q.get("blobId");
    if (!blobId) throw new Error("blobId required");
    const { sealedB64: _omit, ...meta } = await fetchSealedDataset(blobId);
    return meta;
  }
  if (method === "POST" && path === "/v1/feeds/create") {
    const cfg = shareConfigured();
    if (!cfg.ok) throw new Error(cfg.reason);
    const set = String(body.set ?? "default");
    const name = String(body.name ?? set);
    const { shareId, capId } = await createShare(name, "dataset");
    const pub = await publishSealedDataset(set, shareId, tenant);
    const feed = await createFeed(tenant, { set, name, shareId, capId, blobId: pub.blobId, identity: pub.identity, neurons: pub.neurons });
    return { feed };
  }
  if (method === "GET" && path === "/v1/feeds") {
    return { feeds: await listFeeds(tenant, q.get("set") ?? undefined) };
  }
  if (method === "POST" && path === "/v1/feeds/grant") {
    const feed = await getFeed(String(body.feedId ?? ""), tenant);
    if (!feed) throw new Error("feed not found");
    const address = String(body.address ?? "").trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(address)) throw new Error("address must be a 0x-prefixed Sui address");
    await grantReader(feed.shareId, feed.capId, address);
    return { feed: await addGrant(feed.id, tenant, address) };
  }
  if (method === "POST" && path === "/v1/feeds/revoke") {
    const feed = await getFeed(String(body.feedId ?? ""), tenant);
    if (!feed) throw new Error("feed not found");
    const address = String(body.address ?? "").trim();
    await revokeReader(feed.shareId, feed.capId, address);
    return { feed: await removeGrant(feed.id, tenant, address) };
  }
  if (method === "POST" && path === "/v1/feeds/delete") {
    return { deleted: await deleteFeed(String(body.feedId ?? ""), tenant) };
  }
  if (method === "GET" && path === "/v1/share/fetch") {
    const blobId = q.get("blobId");
    if (!blobId) throw new Error("blobId required");
    return fetchSealedDataset(blobId);
  }
  if (method === "POST" && path === "/v1/share/import") {
    const intoSet = String(body.set ?? "default");
    const neurons = Array.isArray(body.neurons) ? body.neurons : [];
    const nx = await Neurus.open(intoSet, { tenant });
    let imported = 0;
    for (const n of neurons) {
      await nx.memory.remember(n as never);
      imported++;
    }
    return { imported };
  }
  if (method === "GET" && path === "/v1/agents") {
    return { agents: await listAgents(tenant) };
  }
  if (method === "POST" && path === "/v1/agents") {
    const s = (v: unknown) => String(v ?? "").trim();
    const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : s(v).split(",").map((x) => x.trim()).filter(Boolean));
    const input: AgentInput = {
      name: s(body.name) || "agent",
      role: s(body.role),
      dataset: s(body.dataset),
      datasetId: s(body.datasetId),
      feeds: arr(body.feeds),
      assets: arr(body.assets),
      wallets: arr(body.wallets),
      intervalMs: Number(body.intervalMs) || 5000,
      durationDays: Number(body.durationDays) || 1,
      threshold: Number(body.threshold) || 0.5,
      telegram: Boolean(body.telegram),
    };
    return { agent: await createAgent(tenant, input) };
  }
  if (method === "POST" && path === "/v1/agents/delete") {
    return { deleted: await deleteAgent(String(body.id ?? ""), tenant) };
  }
  if (method === "POST" && path === "/v1/agents/ask") {
    const set = String(body.dataset ?? body.set ?? "default");
    const datasetId = body.datasetId ? String(body.datasetId) : undefined;
    const question = String(body.question ?? "");
    const model = await gateModel(tenant, body.model);
    const ax = await Neurus.open(set, { behind: true, tenant });
    const hits = await ax.recall(question, { limit: body.limit ?? 6, datasetId });
    const a = await answer(question, hits, { model });
    return { answer: a.text, sources: a.sources, spans: hits.map(span) };
  }
  if (method === "POST" && path === "/v1/net/compile") {
    const sets = (await listSets(tenant)).map((s) => s.name);
    return { spec: await compileWorkflow(String(body.prompt ?? ""), { sets }) };
  }
  if (method === "POST" && path === "/v1/net/workflow") {
    const wfSet = String(body.set ?? "default");
    const wfKey = scopeKey(tenant.id, wfSet);
    workflows.get(wfKey)?.stop();
    const protocols = Array.isArray(body.protocols) ? body.protocols.map(String) : Array.isArray(body.feeds) ? body.feeds.map(String) : [];
    const assets = Array.isArray(body.assets) ? body.assets.map(String) : [];
    const wallets = Array.isArray(body.wallets) ? body.wallets.map(String) : [];
    const deepbookManagers = Array.isArray(body.deepbookManagers) ? body.deepbookManagers.map(String) : [];
    const cfg: WorkflowConfig = {
      set: wfSet,
      netKey: wfKey,
      feeds: protocols.length || assets.length || wallets.length || body.deepbook || deepbookManagers.length ? protocols : ["aave", "uniswap", "lido"],
      assets,
      wallets,
      deepbook: body.deepbook === true,
      deepbookManagers,
      intervalMs: Math.max(2000, Number(body.intervalMs ?? 5000)),
      threshold: Number(body.threshold ?? 0.5),
      epsilon: Number(body.epsilon ?? 0.5),
      reportEvery: Math.max(1, Number(body.reportEvery ?? 3)),
      consolidateEvery: body.consolidateEvery != null ? Math.max(0, Number(body.consolidateEvery)) : undefined,
      strategySet: body.strategySet ? String(body.strategySet) : undefined,
      datasetId: body.datasetId ? String(body.datasetId) : undefined,
      instruction: body.instruction ? String(body.instruction) : undefined,
      durationDays: body.durationDays ? Number(body.durationDays) : undefined,
      telegram: await tenantTelegram(tenant),
      autoReport: body.telegram !== false,
      tenant,
    };
    const endsAt = Date.now() + (cfg.durationDays ?? 5) * 86_400_000;
    const wf = new WorkflowRunner(net, cfg, { ticks: 0, endsAt });
    workflows.set(wfKey, wf);
    wfRecords.set(wfKey, recordFromConfig(wfSet, tenant.id, cfg, endsAt));
    persistWorkflows();
    wf.start();
    return wf.status();
  }
  if (method === "POST" && path === "/v1/net/workflow/stop") {
    const wfSet = String(body.set ?? "default");
    const wfKey = scopeKey(tenant.id, wfSet);
    workflows.get(wfKey)?.stop();
    const rec = wfRecords.get(wfKey);
    if (rec && rec.status === "active") {
      rec.status = "stopped";
      persistWorkflows();
    }
    return workflows.get(wfKey)?.status() ?? { running: false, set: wfSet, feeds: [], assets: [], wallets: [], intervalMs: 0, threshold: 0, ticks: 0 };
  }
  if (method === "GET" && path === "/v1/net/workflow") {
    const wfSet = q.get("set") ?? "default";
    return workflows.get(scopeKey(tenant.id, wfSet))?.status() ?? { running: false, set: wfSet, feeds: [], assets: [], wallets: [], intervalMs: 0, threshold: 0, ticks: 0 };
  }
  if (method === "POST" && path === "/v1/net/workflow/report") {
    const wf = workflows.get(scopeKey(tenant.id, String(body.set ?? "default")));
    if (!wf) return { sent: false, error: "no running workflow for this set" };
    return wf.report();
  }
  if (method === "POST" && path === "/v1/net/workflow/brief") {
    const wf = workflows.get(scopeKey(tenant.id, String(body.set ?? "default")));
    if (!wf) return { sent: false, error: "no running workflow for this set" };
    return wf.dailyBrief();
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
      const model = await gateModel(tenant, body.model);
      const hits = await nx.recall(String(body.question), { limit: body.limit ?? 5 });
      const a = await answer(String(body.question), hits, { model });
      return { answer: a.text, sources: a.sources, spans: hits.map(span) };
    }
    case "POST /v1/ingest/file": {
      const f = await nx.addFile(String(body.path));
      return { file: { id: f.id, title: f.title, blobId: f.blobId } };
    }
    case "POST /v1/ingest/dir":
      return nx.addDir(String(body.path), { max: body.max ?? 100 });
    case "POST /v1/ingest/calendar":
      return nx.addCalendar(Array.isArray(body.events) ? body.events : []);
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
    case "POST /v1/notify/telegram/link": {
      const bot = process.env.TELEGRAM_BOT_USERNAME;
      if (!bot) return { configured: false, error: "TELEGRAM_BOT_USERNAME not set on the server" };
      const token = mintLinkToken(tenant.id, setName);
      return { configured: true, url: `https://t.me/${bot.replace(/^@/, "")}?start=${token}` };
    }
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
        failed: nx.memory.failed(),
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
    case "POST /v1/datasets/delete":
      return nx.deleteDataset(String(body.id));
    case "GET /v1/widgets":
      return { widgets: await nx.widgets() };
    case "POST /v1/widgets":
      return { widget: await nx.createWidget(String(body.name), body.origins ?? [], body.datasetId ? String(body.datasetId) : undefined) };
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
    case "POST /v1/reconcile":
      return nx.reconcile();
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

  const startToken = text.match(/^\/start\s+(\S+)/);
  if (startToken) {
    const link = consumeLinkToken(startToken[1]);
    if (!link) {
      await reply("That link expired. Open Neurus → Telegram → Connect to get a fresh one.");
      return;
    }
    const linkTenant = await tenantById(link.user);
    await connectTelegram(chatId, linkTenant);
    await bindChat(chatId, { user: link.user, set: link.set });
    await reply(`Connected ✓\nNeurus will send alerts here. Ask me anything about "${link.set}".`);
    return;
  }

  const binding = await getChatBinding(chatId);
  if (!binding) {
    await reply(`This chat isn't linked yet.\nOpen Neurus → Telegram → Connect to link it in one tap.`);
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
    const streamTenant = await resolveTenant((req.headers["x-neurus-user"] as string | undefined)?.trim() || undefined);
    const set = scopeKey(streamTenant.id, url.searchParams.get("set")?.trim() || "default");
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
      const pool = await nx.recall(String(body.question), { limit: w.datasetId ? 40 : 5 });
      const hits = w.datasetId ? pool.filter((h) => h.neuron.meta?.datasetId === w.datasetId).slice(0, 5) : pool;
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS });
      const sse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      sse("spans", { spans: hits.map(span) });
      const a = await answerStream(String(body.question), hits, (t) => sse("token", { t }), { docsName: w.name });
      sse("done", { answer: a.text, sources: a.sources });
      res.end();
    } catch (e: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: e?.message ?? String(e) })}\n\n`);
      res.end();
    }
    return;
  }
  if (url.pathname.startsWith("/v1/a2a/")) {
    const rest = url.pathname.slice("/v1/a2a/".length);
    const slash = rest.indexOf("/");
    const id = (slash === -1 ? rest : rest.slice(0, slash)).trim();
    const sub = slash === -1 ? "" : rest.slice(slash + 1);
    const agent = await getAgentById(id);
    if (!agent) { send(res, 404, jsonrpcError(null, -32004, "unknown agent")); return; }
    const base = process.env.NEURUS_PUBLIC_URL ?? `http://${req.headers.host ?? "localhost:" + PORT}`;
    if (req.method === "GET" && (sub === ".well-known/agent-card.json" || sub === "")) {
      send(res, 200, buildAgentCard(agent, base));
      return;
    }
    if (req.method === "POST" && sub === "") {
      const rpc = await readBody(req);
      if (rpc?.method !== "message/send") { send(res, 200, jsonrpcError(rpc?.id, -32601, "method not supported; use message/send")); return; }
      if (!allowRate(`a2a:${agent.id}`)) { send(res, 200, jsonrpcError(rpc?.id, -32003, "rate limit exceeded, slow down")); return; }
      const question = textFromMessage(rpc.params);
      if (!question) { send(res, 200, jsonrpcError(rpc?.id, -32602, "no text part in message")); return; }
      try {
        const tenant = await tenantById(agent.tenantId);
        const ax = await Neurus.open(agent.dataset || "default", { behind: true, tenant });
        const hits = await ax.recall(question, { limit: 6, datasetId: agent.datasetId || undefined });
        const a = await answer(question, hits, { docsName: agent.name });
        send(res, 200, jsonrpcResult(rpc?.id, a.text, a.sources));
      } catch (e: any) {
        send(res, 200, jsonrpcError(rpc?.id, -32603, e?.message ?? "internal error"));
      }
      return;
    }
    send(res, 404, jsonrpcError(null, -32601, "not found"));
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/ask/stream") {
    try {
      const body = await readBody(req);
      const tenant = await resolveTenant((req.headers["x-neurus-user"] as string | undefined)?.trim() || undefined);
      const model = await gateModel(tenant, body.model);
      const nx = await Neurus.open(body.set ?? "default", { behind: true, tenant });
      const hits = await nx.recall(String(body.question), { limit: body.limit ?? 5 }).catch(() => nx.recall(String(body.question), { limit: body.limit ?? 5 }));
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...CORS });
      const sse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      sse("spans", { spans: hits.map(span) });
      const a = await answerStream(String(body.question), hits, (t) => sse("token", { t }), { model });
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

async function resumeWorkflows(): Promise<void> {
  const records = await loadRecords();
  let resumed = 0;
  for (const rec of records) {
    const netKey = scopeKey(rec.tenantId, rec.set);
    wfRecords.set(netKey, rec);
    if (rec.status !== "active") continue;
    if (rec.endsAt <= Date.now()) {
      rec.status = "expired";
      continue;
    }
    try {
      const tenant = await resolveTenant(rec.tenantId === "local" ? undefined : rec.tenantId);
      const cfg: WorkflowConfig = { set: rec.set, netKey, ...rec.spec, telegram: await tenantTelegram(tenant), tenant };
      const wf = new WorkflowRunner(net, cfg, { ticks: rec.cursor.ticksDone, endsAt: rec.endsAt });
      workflows.set(netKey, wf);
      wf.start();
      resumed++;
    } catch (e) {
      console.error(`wf resume ${rec.set}:`, (e as Error).message);
    }
  }
  if (resumed) console.log(`  resumed ${resumed} workflow(s) from Walrus`);
}

function syncWorkflowCursors(): void {
  let changed = false;
  for (const [set, rec] of wfRecords) {
    if (rec.status !== "active") continue;
    const st = workflows.get(set)?.status();
    if (!st) continue;
    if (st.ticks !== rec.cursor.ticksDone) {
      rec.cursor = { ticksDone: st.ticks, lastTickAt: Date.now() };
      changed = true;
    }
    if (!st.running && rec.endsAt <= Date.now()) {
      rec.status = "expired";
      changed = true;
    }
  }
  if (changed) persistWorkflows();
}

async function boot() {
  try {
    const restored = await net.restore();
    if (restored.length) console.log(`  restored ${restored.length} net set(s) from Walrus`);
  } catch {
    console.log("  net restore skipped");
  }
  await resumeWorkflows().catch((e) => console.error("wf resume:", (e as Error).message));
  setInterval(() => {
    net.checkpoint().catch(() => {});
  }, 15_000);
  setInterval(syncWorkflowCursors, 60_000);
  server.listen(PORT, () => {
    console.log(`\n  Neurus API  →  http://localhost:${PORT}/v1\n`);
    warmup()
      .then(() => console.log("  reranker warm — first Ask is instant"))
      .catch(() => console.log("  reranker warmup skipped (will load on first Ask)"));
  });
}
boot();
