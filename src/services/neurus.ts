const BASE = process.env.NEXT_PUBLIC_NEURUS_API ?? "http://localhost:4318";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
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

export const neurus = {
  health: () => call<{ ok: boolean; version: string }>("GET", "/health"),
  sets: () => call<{ sets: SetInfo[] }>("GET", "/sets").then((r) => r.sets),
  createSet: (name: string) => call<{ set: SetInfo }>("POST", "/sets", { name }).then((r) => r.set),
  map: (set: string) => call<MapInfo>("GET", `/map?set=${encodeURIComponent(set)}`),
  neurons: (set: string) => call<{ neurons: NeuronRow[] }>("GET", `/neurons?set=${encodeURIComponent(set)}`).then((r) => r.neurons),
  ask: (set: string, question: string) => call<{ answer: string; sources: string[]; spans: Span[] }>("POST", "/ask", { set, question }),
  remember: (set: string, text: string) => call<{ people: unknown[]; commitments: unknown[] }>("POST", "/remember", { set, text }),
  indexWalrus: (set: string, blobId: string, title?: string) => call<{ source: { id: string; title: string } }>("POST", "/ingest/walrus", { set, blobId, title }),
  reflect: (set: string) => call<{ insights: { body: string; importance?: number }[] }>("POST", "/reflect", { set }),
  surface: (set: string, context?: string) => call<{ surfacings: { type: string; body: string; score: number }[] }>("POST", "/surface", { set, context }),
  forget: (set: string, id: string) => call<{ forgotten: boolean }>("POST", "/forget", { set, id }),
};

export const API_BASE = BASE;
