import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Memory } from "./memory";

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

const REGISTRY = process.env.NEURUS_SETS ?? ".neurus-sets.json";

export async function listSets(): Promise<KnowledgeSet[]> {
  try {
    return JSON.parse(await readFile(REGISTRY, "utf8"));
  } catch {
    return [];
  }
}

async function saveSets(sets: KnowledgeSet[]): Promise<void> {
  await writeFile(REGISTRY, JSON.stringify(sets, null, 2));
}

export async function createSet(name: string, visibility: Visibility = "private"): Promise<KnowledgeSet> {
  const sets = await listSets();
  const existing = sets.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const id = `set_${randomUUID().slice(0, 8)}`;
  const set: KnowledgeSet = {
    id,
    name,
    namespace: `neurus_${id}`,
    manifestPath: `.neurus-${id}.json`,
    visibility,
    integrity: "none",
    sharedWith: [],
    createdAt: Date.now(),
  };
  sets.push(set);
  await saveSets(sets);
  return set;
}

export async function getSet(idOrName: string): Promise<KnowledgeSet | undefined> {
  const sets = await listSets();
  const key = idOrName.toLowerCase();
  return sets.find((s) => s.id === idOrName) ?? sets.find((s) => s.name.toLowerCase() === key);
}

export async function resolveSet(idOrName?: string): Promise<KnowledgeSet> {
  if (idOrName) {
    return (await getSet(idOrName)) ?? (await createSet(idOrName));
  }
  return (await getSet("default")) ?? (await createSet("default"));
}

export async function shareSet(idOrName: string, withId: string): Promise<KnowledgeSet | undefined> {
  const sets = await listSets();
  const set = sets.find((s) => s.id === idOrName || s.name.toLowerCase() === idOrName.toLowerCase());
  if (!set) return undefined;
  set.visibility = "shared";
  if (!set.sharedWith.includes(withId)) set.sharedWith.push(withId);
  await saveSets(sets);
  return set;
}

export async function revokeSet(idOrName: string, withId: string): Promise<KnowledgeSet | undefined> {
  const sets = await listSets();
  const set = sets.find((s) => s.id === idOrName || s.name.toLowerCase() === idOrName.toLowerCase());
  if (!set) return undefined;
  set.sharedWith = set.sharedWith.filter((w) => w !== withId);
  if (set.sharedWith.length === 0) set.visibility = "private";
  await saveSets(sets);
  return set;
}

export function canRead(set: KnowledgeSet, identity: string): boolean {
  return set.visibility === "shared" && set.sharedWith.includes(identity);
}

export async function setIntegrity(idOrName: string, integrity: Integrity): Promise<KnowledgeSet | undefined> {
  const sets = await listSets();
  const set = sets.find((s) => s.id === idOrName || s.name.toLowerCase() === idOrName.toLowerCase());
  if (!set) return undefined;
  set.integrity = integrity;
  await saveSets(sets);
  return set;
}

export async function attest(idOrName: string, root: string): Promise<KnowledgeSet | undefined> {
  const sets = await listSets();
  const set = sets.find((s) => s.id === idOrName || s.name.toLowerCase() === idOrName.toLowerCase());
  if (!set) return undefined;
  set.attestedRoot = root;
  set.attestedAt = Date.now();
  await saveSets(sets);
  return set;
}

export function openSet(set: KnowledgeSet): Memory {
  return new Memory(set.namespace, set.manifestPath);
}
