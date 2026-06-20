import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { localTenant, type Tenant } from "../identity/credentials";
import { kvEnabled, kvGet, kvSet } from "../storage/kv";

export type DatasetKind = "file" | "snapshot" | "import" | "web" | "folder" | "github";

export interface Dataset {
  id: string;
  set: string;
  kind: DatasetKind;
  title: string;
  blobId?: string;
  objectId?: string;
  endEpoch?: number;
  bytes?: number;
  url?: string;
  pages?: number;
  createdAt: number;
}

function registryPath(tenant: Tenant): string {
  return tenant.id === "local" ? process.env.NEURUS_DATASETS ?? ".neurus-datasets.json" : join(tenant.root, "datasets.json");
}

function useKv(tenant: Tenant): boolean {
  return kvEnabled() && tenant.id !== "local";
}

function datasetsKey(tenant: Tenant): string {
  return `neurus:datasets:${tenant.id}`;
}

async function loadAll(tenant: Tenant): Promise<Dataset[]> {
  if (useKv(tenant)) {
    const raw = await kvGet(datasetsKey(tenant));
    return raw ? JSON.parse(raw) : [];
  }
  try {
    return JSON.parse(await readFile(registryPath(tenant), "utf8"));
  } catch {
    return [];
  }
}

async function saveAll(all: Dataset[], tenant: Tenant): Promise<void> {
  if (useKv(tenant)) {
    await kvSet(datasetsKey(tenant), JSON.stringify(all));
    return;
  }
  if (tenant.id !== "local") await mkdir(tenant.root, { recursive: true });
  await writeFile(registryPath(tenant), JSON.stringify(all, null, 2));
}

export async function listDatasets(set?: string, tenant: Tenant = localTenant()): Promise<Dataset[]> {
  const all = await loadAll(tenant);
  return set ? all.filter((d) => d.set === set) : all;
}

export async function addDataset(d: Omit<Dataset, "id" | "createdAt">, tenant: Tenant = localTenant()): Promise<Dataset> {
  const all = await loadAll(tenant);
  const dataset: Dataset = { ...d, id: `ds_${randomUUID().slice(0, 8)}`, createdAt: Date.now() };
  all.push(dataset);
  await saveAll(all, tenant);
  return dataset;
}

export async function updateDataset(id: string, patch: Partial<Dataset>, tenant: Tenant = localTenant()): Promise<Dataset | undefined> {
  const all = await loadAll(tenant);
  const d = all.find((x) => x.id === id);
  if (!d) return undefined;
  Object.assign(d, patch);
  await saveAll(all, tenant);
  return d;
}

export async function getDataset(id: string, tenant: Tenant = localTenant()): Promise<Dataset | undefined> {
  return (await loadAll(tenant)).find((d) => d.id === id);
}

export async function deleteDataset(id: string, tenant: Tenant = localTenant()): Promise<Dataset | undefined> {
  const all = await loadAll(tenant);
  const idx = all.findIndex((d) => d.id === id);
  if (idx === -1) return undefined;
  const [removed] = all.splice(idx, 1);
  await saveAll(all, tenant);
  return removed;
}
