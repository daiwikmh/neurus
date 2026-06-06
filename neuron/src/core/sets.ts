import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Memory } from "./memory";
import { MemwalStore } from "../storage/memwal";
import { localTenant, type Tenant } from "../identity/credentials";
import { kvEnabled, kvGet, kvSet } from "../storage/kv";

export type Visibility = "private" | "shared";
export type Integrity = "none" | "verified";

export interface KnowledgeSet {
  id: string;
  name: string;
  namespace: string;
  manifestPath: string;
  visibility: Visibility;
  integrity: Integrity;
  sharedWith: string[];
  createdAt: number;
  attestedRoot?: string;
  attestedAt?: number;
}

function registryPath(tenant: Tenant): string {
  return tenant.id === "local" ? process.env.NEURUS_SETS ?? ".neurus-sets.json" : join(tenant.root, "sets.json");
}

function useKv(tenant: Tenant): boolean {
  return kvEnabled() && tenant.id !== "local";
}

function setsKey(tenant: Tenant): string {
  return `neurus:sets:${tenant.id}`;
}

function manifestPath(tenant: Tenant, set: KnowledgeSet): string {
  return tenant.id === "local" ? set.manifestPath : join(tenant.root, set.manifestPath);
}

export async function listSets(tenant: Tenant = localTenant()): Promise<KnowledgeSet[]> {
  if (useKv(tenant)) {
    const raw = await kvGet(setsKey(tenant));
    return raw ? JSON.parse(raw) : [];
  }
  try {
    return JSON.parse(await readFile(registryPath(tenant), "utf8"));
  } catch {
    return [];
  }
}

async function saveSets(sets: KnowledgeSet[], tenant: Tenant): Promise<void> {
  if (useKv(tenant)) {
    await kvSet(setsKey(tenant), JSON.stringify(sets));
    return;
  }
  if (tenant.id !== "local") await mkdir(tenant.root, { recursive: true });
  await writeFile(registryPath(tenant), JSON.stringify(sets, null, 2));
}

export async function createSet(name: string, visibility: Visibility = "private", tenant: Tenant = localTenant()): Promise<KnowledgeSet> {
  const sets = await listSets(tenant);
  const existing = sets.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const id = `set_${randomUUID().slice(0, 8)}`;
  const set: KnowledgeSet = {
    id,
    name,
    namespace: `neurus_${tenant.id}_${id}`,
    manifestPath: `.neurus-${id}.json`,
    visibility,
    integrity: "none",
    sharedWith: [],
    createdAt: Date.now(),
  };
  sets.push(set);
  await saveSets(sets, tenant);
  return set;
}

export async function getSet(idOrName: string, tenant: Tenant = localTenant()): Promise<KnowledgeSet | undefined> {
  const sets = await listSets(tenant);
  const key = idOrName.toLowerCase();
  return sets.find((s) => s.id === idOrName) ?? sets.find((s) => s.name.toLowerCase() === key);
}

export async function resolveSet(idOrName?: string, tenant: Tenant = localTenant()): Promise<KnowledgeSet> {
  if (idOrName) return (await getSet(idOrName, tenant)) ?? (await createSet(idOrName, "private", tenant));
  return (await getSet("default", tenant)) ?? (await createSet("default", "private", tenant));
}

async function mutate(idOrName: string, tenant: Tenant, fn: (s: KnowledgeSet) => void): Promise<KnowledgeSet | undefined> {
  const sets = await listSets(tenant);
  const set = sets.find((s) => s.id === idOrName || s.name.toLowerCase() === idOrName.toLowerCase());
  if (!set) return undefined;
  fn(set);
  await saveSets(sets, tenant);
  return set;
}

export function shareSet(idOrName: string, withId: string, tenant: Tenant = localTenant()): Promise<KnowledgeSet | undefined> {
  return mutate(idOrName, tenant, (s) => {
    s.visibility = "shared";
    if (!s.sharedWith.includes(withId)) s.sharedWith.push(withId);
  });
}

export function revokeSet(idOrName: string, withId: string, tenant: Tenant = localTenant()): Promise<KnowledgeSet | undefined> {
  return mutate(idOrName, tenant, (s) => {
    s.sharedWith = s.sharedWith.filter((w) => w !== withId);
    if (s.sharedWith.length === 0) s.visibility = "private";
  });
}

export function canRead(set: KnowledgeSet, identity: string): boolean {
  return set.visibility === "shared" && set.sharedWith.includes(identity);
}

export function setIntegrity(idOrName: string, integrity: Integrity, tenant: Tenant = localTenant()): Promise<KnowledgeSet | undefined> {
  return mutate(idOrName, tenant, (s) => { s.integrity = integrity; });
}

export function attest(idOrName: string, root: string, tenant: Tenant = localTenant()): Promise<KnowledgeSet | undefined> {
  return mutate(idOrName, tenant, (s) => { s.attestedRoot = root; s.attestedAt = Date.now(); });
}

export function openSet(set: KnowledgeSet, tenant: Tenant = localTenant()): Memory {
  return new Memory(set.namespace, manifestPath(tenant, set), new MemwalStore(set.namespace, tenant.credentials));
}
