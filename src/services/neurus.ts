const BASE = process.env.NEXT_PUBLIC_NEURUS_API ?? "http://localhost:4318";

let currentUser: string | null = null;
export function setNeurusUser(user: string | null) {
  currentUser = user;
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["content-type"] = "application/json";
  if (currentUser) h["x-neurus-user"] = currentUser;
  return h;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    headers: headers(!!body),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Neurus API ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

export type NeuronType = "person" | "note" | "file" | "chunk" | "commitment" | "insight";
export type Trust = "owned" | "shared" | "untrusted";
export type Durability = "pending" | "confirmed" | "failed";

export interface Span {
  id: string;
  title: string;
  type: NeuronType;
  trust: Trust;
  relevance: number;
  score: number;
  preview?: string;
}

export interface NeuronRow {
  id: string;
  type: NeuronType;
  title: string;
  trust: Trust;
  author: string;
  durability: Durability;
  importance?: number;
  ageHours: number;
  synapses: { to: string; kind: string }[];
  preview: string;
}

export interface SetInfo {
  id: string;
  name: string;
  namespace: string;
  visibility: "private" | "shared";
  integrity: "none" | "verified";
  sharedWith: string[];
}

export interface MapInfo {
  set: string;
  counts: Record<NeuronType, number>;
  pending: number;
}

export interface AccountStatus {
  linked: boolean;
  accountId?: string;
  owned: boolean;
  local?: boolean;
}

export const neurus = {
  health: () => call<{ ok: boolean; version: string }>("GET", "/health"),
  sets: () => call<{ sets: SetInfo[] }>("GET", "/sets").then((r) => r.sets),
  createSet: (name: string) => call<{ set: SetInfo }>("POST", "/sets", { name }).then((r) => r.set),
  map: (set: string) => call<MapInfo>("GET", `/map?set=${encodeURIComponent(set)}`),
  neurons: (set: string) => call<{ neurons: NeuronRow[] }>("GET", `/neurons?set=${encodeURIComponent(set)}`).then((r) => r.neurons),
  ask: (set: string, question: string, model?: string) => call<{ answer: string; sources: string[]; spans: Span[] }>("POST", "/ask", { set, question, model }),
  askStream: async (set: string, question: string, onEvent: (e: { event: string; data: any }) => void, model?: string): Promise<void> => {
    const res = await fetch(`${BASE}/v1/ask/stream`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ set, question, model }),
    });
    if (!res.ok || !res.body) throw new Error(`Neurus API ${res.status}: ${await res.text().catch(() => "")}`);
    await readSSE(res, onEvent);
  },
  remember: (set: string, text: string) => call<{ people: unknown[]; commitments: unknown[] }>("POST", "/remember", { set, text }),
  indexWalrus: (set: string, blobId: string, title?: string) => call<{ source: { id: string; title: string } }>("POST", "/ingest/walrus", { set, blobId, title }),
  reflect: (set: string) => call<{ insights: { body: string; importance?: number }[] }>("POST", "/reflect", { set }),
  surface: (set: string, context?: string) => call<{ surfacings: { type: string; body: string; score: number }[] }>("POST", "/surface", { set, context }),
  forget: (set: string, id: string) => call<{ forgotten: boolean }>("POST", "/forget", { set, id }),
  datasets: (set: string) => call<{ datasets: Dataset[] }>("GET", `/datasets?set=${encodeURIComponent(set)}`).then((r) => r.datasets),
  uploadDataset: (set: string, name: string, content: string) => call<{ dataset: Dataset }>("POST", "/datasets/upload", { set, name, content }).then((r) => r.dataset),
  publishDataset: (set: string) => call<{ dataset: Dataset }>("POST", "/datasets/publish", { set }).then((r) => r.dataset),
  importDataset: (set: string, blobId: string, title?: string) => call<{ dataset: Dataset }>("POST", "/datasets/import", { set, blobId, title }).then((r) => r.dataset),
  addWebDataset: (set: string, url: string, max?: number) => call<{ dataset: Dataset; pages: number; failed: number; skipped: number }>("POST", "/datasets/web", { set, url, max }),
  addRepoDataset: (set: string, repo: string, max?: number) => call<{ dataset: Dataset; files: number; failed: number }>("POST", "/datasets/github", { set, repo, max }),
  addFolderDataset: (set: string, name: string, files: { path: string; content: string }[]) => call<{ dataset: Dataset; files: number; failed: number }>("POST", "/datasets/folder", { set, name, files }),
  datasetHealth: (set: string, objectId: string) => call<{ health: BlobHealth }>("POST", "/datasets/health", { set, objectId }).then((r) => r.health),
  renewDataset: (set: string, id: string) => call<{ dataset: Dataset }>("POST", "/datasets/renew", { set, id }).then((r) => r.dataset),
  widgets: (set: string) => call<{ widgets: Widget[] }>("GET", `/widgets?set=${encodeURIComponent(set)}`).then((r) => r.widgets),
  createWidget: (set: string, name: string, origins: string[], datasetId?: string) => call<{ widget: Widget }>("POST", "/widgets", { set, name, origins, datasetId }).then((r) => r.widget),
  deleteWidget: (set: string, id: string) => call<{ deleted: boolean }>("POST", "/widgets/delete", { set, id }),
  notifyConfig: (set: string) => call<{ config: NotifyConfig }>("GET", `/notify?set=${encodeURIComponent(set)}`).then((r) => r.config),
  connectTelegram: (set: string, chatId: string) => call<{ config: NotifyConfig }>("POST", "/notify/telegram", { set, chatId }).then((r) => r.config),
  testNotify: (set: string) => call<{ delivered: string[]; skipped: string[] }>("POST", "/notify/test", { set }),
  accountStatus: () => call<AccountStatus>("GET", "/account"),
  linkAccount: (accountId: string, delegateKey: string, serverUrl?: string) => call<AccountStatus>("POST", "/account/link", { accountId, delegateKey, serverUrl }),
  provisionAccount: () => call<AccountStatus>("POST", "/account/provision"),
  adoptEnvAccount: () => call<AccountStatus>("POST", "/account/adopt-env"),
  unlinkAccount: () => call<{ unlinked: boolean }>("POST", "/account/unlink"),
  netState: (set: string) => call<NetSnapshot>("GET", `/net/state?set=${encodeURIComponent(set)}`),
  netGrant: (set: string, actor: string, secret: string, can: "read" | "write" = "write") =>
    call<NetSnapshot>("POST", "/net/grant", { set, actor, secret, can }),
  netRevoke: (set: string, actor: string) => call<NetSnapshot>("POST", "/net/revoke", { set, actor }),
  submitOp: (set: string, op: unknown) =>
    call<{ ok: boolean; reason?: string; root: string; lamport: number }>("POST", "/net/op", { set, op }),
  seedNet: (set: string) => call<NetSnapshot & { added: number }>("POST", "/net/seed", { set }),
  netAsk: (set: string, question: string, model?: string) => call<NetAnswer>("POST", "/net/ask", { set, question, model }),
  billingStatus: () => call<BillingStatus>("GET", "/billing/status"),
  billingVerify: (txDigest: string) => call<{ paid: boolean; amountSui?: number; already?: boolean }>("POST", "/billing/verify", { txDigest }),
  logPlay: (set: string, p: { asset: string; direction: "long" | "short"; entry: number; target?: number; stop?: number; thesis?: string }) =>
    call<NetSnapshot & { play: NetNeuron }>("POST", "/net/play", { set, ...p }),
  closePlay: (set: string, playId: string) => call<NetSnapshot & { closed: NetNeuron; postmortem: NetNeuron }>("POST", "/net/play/close", { set, playId }),
  listPlays: (set: string) => call<{ plays: PlayRow[] }>("GET", `/net/plays?set=${encodeURIComponent(set)}`).then((r) => r.plays),
  compileWorkflow: (set: string, prompt: string) => call<{ spec: WorkflowSpec }>("POST", "/net/compile", { set, prompt }).then((r) => r.spec),
  startWorkflow: (
    set: string,
    opts: { feeds?: string[]; protocols?: string[]; assets?: string[]; wallets?: string[]; deepbook?: boolean; deepbookManagers?: string[]; strategySet?: string; datasetId?: string; instruction?: string; durationDays?: number; intervalMs?: number; threshold?: number; reportEvery?: number; telegram?: boolean },
  ) => call<WorkflowStatus>("POST", "/net/workflow", { set, ...opts }),
  stopWorkflow: (set: string) => call<WorkflowStatus>("POST", "/net/workflow/stop", { set }),
  workflowStatus: (set: string) => call<WorkflowStatus>("GET", `/net/workflow?set=${encodeURIComponent(set)}`),
  reportNow: (set: string) => call<{ sent: boolean; report?: string; error?: string }>("POST", "/net/workflow/report", { set }),
  briefNow: (set: string) => call<{ sent: boolean; brief?: string; date?: string; error?: string }>("POST", "/net/workflow/brief", { set }),
  snapshotSet: (set: string) => call<{ blobId: string; neurons: number }>("POST", "/share/snapshot", { set }),
  importSnapshot: (set: string, blobId: string) => call<{ imported: number }>("POST", "/share/snapshot/import", { set, blobId }),
  publishShare: (set: string, shareId: string) =>
    call<{ blobId: string; shareId: string; identity: string; packageId: string; neurons: number }>("POST", "/share/publish", { set, shareId }),
  inspectShare: (blobId: string) => call<{ packageId: string; threshold: number; services: number }>("GET", `/share/inspect?blobId=${encodeURIComponent(blobId)}`),
  feeds: (set: string) => call<{ feeds: Feed[] }>("GET", `/feeds?set=${encodeURIComponent(set)}`).then((r) => r.feeds),
  createFeed: (set: string, name: string) => call<{ feed: Feed }>("POST", "/feeds/create", { set, name }).then((r) => r.feed),
  grantFeed: (feedId: string, address: string) => call<{ feed: Feed }>("POST", "/feeds/grant", { feedId, address }).then((r) => r.feed),
  revokeFeed: (feedId: string, address: string) => call<{ feed: Feed }>("POST", "/feeds/revoke", { feedId, address }).then((r) => r.feed),
  deleteFeed: (feedId: string) => call<{ deleted: boolean }>("POST", "/feeds/delete", { feedId }),
  fetchSealed: (blobId: string) =>
    call<{ sealedB64: string; packageId: string; threshold: number; services: number }>("GET", `/share/fetch?blobId=${encodeURIComponent(blobId)}`),
  importNeurons: (set: string, neurons: unknown[]) => call<{ imported: number }>("POST", "/share/import", { set, neurons }),
  agents: () => call<{ agents: AgentDef[] }>("GET", "/agents").then((r) => r.agents),
  createAgent: (a: Omit<AgentDef, "id" | "tenantId" | "createdAt">) => call<{ agent: AgentDef }>("POST", "/agents", a).then((r) => r.agent),
  deleteAgent: (id: string) => call<{ deleted: boolean }>("POST", "/agents/delete", { id }),
  askAgent: (dataset: string, datasetId: string | undefined, question: string, model?: string) =>
    call<{ answer: string; sources: string[]; spans: Span[] }>("POST", "/agents/ask", { dataset, datasetId, question, model }),
};

export interface AgentDef {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  dataset: string;
  datasetId: string;
  feeds: string[];
  assets: string[];
  wallets: string[];
  intervalMs: number;
  durationDays: number;
  threshold: number;
  telegram: boolean;
  createdAt: number;
}

export interface Feed {
  id: string;
  tenantId: string;
  set: string;
  name: string;
  shareId: string;
  capId: string;
  blobId: string;
  identity: string;
  neurons: number;
  createdAt: number;
  grants: string[];
}

export interface PlayRow {
  id: string;
  asset: string;
  direction: "long" | "short";
  entry: number;
  target?: number;
  stop?: number;
  thesis?: string;
  status: "open" | "closed";
  openedAt: number;
  exit?: number;
  closedAt?: number;
  current: number | null;
  plPct?: number;
  distToStop?: number;
  distToTarget?: number;
}

export interface BillingStatus {
  paid: boolean;
  configured: boolean;
  priceUsd: number;
  priceSui?: number | null;
  treasury?: string;
}

export interface NetAnswer {
  text: string;
  sources: string[];
  spans: { id: string; title: string; author: string; score: number; relevance: number; ageHours: number; preview: string }[];
}

export interface WorkflowSpec {
  strategySet: string | null;
  assets: string[];
  protocols: string[];
  wallets: string[];
  deepbook: boolean;
  intervalMs: number;
  durationDays: number;
  instruction: string;
  telegram: boolean;
}

export interface WorkflowStatus {
  running: boolean;
  set: string;
  feeds: string[];
  assets: string[];
  wallets: string[];
  deepbook?: boolean;
  intervalMs: number;
  threshold: number;
  strategySet?: string;
  instruction?: string;
  durationDays?: number;
  endsAt?: number;
  ticks: number;
  lastReport?: string;
}

export interface NotifyConfig {
  telegram?: { chatId: string };
}

export interface Dataset {
  id: string;
  set: string;
  kind: "file" | "snapshot" | "import" | "web" | "folder" | "github";
  title: string;
  blobId?: string;
  objectId?: string;
  endEpoch?: number;
  bytes?: number;
  url?: string;
  pages?: number;
  createdAt: number;
}

export interface BlobHealth {
  objectId: string;
  certified: boolean;
  certifiedEpoch?: number;
  startEpoch: number;
  endEpoch: number;
  deletable: boolean;
  currentEpoch?: number;
  epochsRemaining?: number;
  expired?: boolean;
}

export const API_BASE = BASE;

export interface Widget {
  id: string;
  tenantId: string;
  set: string;
  name: string;
  origins: string[];
  datasetId?: string;
  createdAt: number;
}

async function readSSE(res: Response, onEvent: (e: { event: string; data: any }) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent({ event, data: JSON.parse(data) });
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

export function publicWidget(id: string): Promise<{ id: string; name: string }> {
  return fetch(`${BASE}/v1/public/widget?id=${encodeURIComponent(id)}`).then((r) => {
    if (!r.ok) throw new Error(`widget ${r.status}`);
    return r.json();
  });
}

export async function publicAskStream(widget: string, question: string, onEvent: (e: { event: string; data: any }) => void): Promise<void> {
  const res = await fetch(`${BASE}/v1/public/ask/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ widget, question }),
  });
  if (!res.ok || !res.body) throw new Error(`Neurus ${res.status}: ${await res.text().catch(() => "")}`);
  await readSSE(res, onEvent);
}

export interface NetNeuron {
  id: string;
  type: NeuronType;
  title: string;
  body: string;
  blobId?: string;
  source: { author: string; trust: Trust };
  createdAt: number;
  synapses: { to: string; kind: string }[];
  meta?: Record<string, unknown>;
}

export interface RosterEntry {
  actor: string;
  can: "read" | "write";
}

export interface NetSnapshot {
  neurons: NetNeuron[];
  root: string;
  roster: RosterEntry[];
}

export function netStream(set: string, onEvent: (e: { event: string; data: any }) => void): () => void {
  const es = new EventSource(`${BASE}/v1/net/stream?set=${encodeURIComponent(set)}`);
  for (const ev of ["op", "state", "roster"]) {
    es.addEventListener(ev, (m) => onEvent({ event: ev, data: JSON.parse((m as MessageEvent).data) }));
  }
  return () => es.close();
}
