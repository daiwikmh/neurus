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
  ask: (set: string, question: string) => call<{ answer: string; sources: string[]; spans: Span[] }>("POST", "/ask", { set, question }),
  askStream: async (set: string, question: string, onEvent: (e: { event: string; data: any }) => void): Promise<void> => {
    const res = await fetch(`${BASE}/v1/ask/stream`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ set, question }),
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
  createWidget: (set: string, name: string, origins: string[]) => call<{ widget: Widget }>("POST", "/widgets", { set, name, origins }).then((r) => r.widget),
  deleteWidget: (set: string, id: string) => call<{ deleted: boolean }>("POST", "/widgets/delete", { set, id }),
  notifyConfig: (set: string) => call<{ config: NotifyConfig }>("GET", `/notify?set=${encodeURIComponent(set)}`).then((r) => r.config),
  connectTelegram: (set: string, chatId: string) => call<{ config: NotifyConfig }>("POST", "/notify/telegram", { set, chatId }).then((r) => r.config),
  testNotify: (set: string) => call<{ delivered: string[]; skipped: string[] }>("POST", "/notify/test", { set }),
  accountStatus: () => call<AccountStatus>("GET", "/account"),
  linkAccount: (accountId: string, delegateKey: string, serverUrl?: string) => call<AccountStatus>("POST", "/account/link", { accountId, delegateKey, serverUrl }),
  provisionAccount: () => call<AccountStatus>("POST", "/account/provision"),
  adoptEnvAccount: () => call<AccountStatus>("POST", "/account/adopt-env"),
  unlinkAccount: () => call<{ unlinked: boolean }>("POST", "/account/unlink"),
};

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
