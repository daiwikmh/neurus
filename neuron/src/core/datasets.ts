import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { localTenant, type Tenant } from "../identity/credentials";

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

export async function listDatasets(set?: string, tenant: Tenant = localTenant()): Promise<Dataset[]> {
  let all: Dataset[];
  try {
    all = JSON.parse(await readFile(registryPath(tenant), "utf8"));
  } catch {
    all = [];
  }
  return set ? all.filter((d) => d.set === set) : all;
}

export async function addDataset(d: Omit<Dataset, "id" | "createdAt">, tenant: Tenant = localTenant()): Promise<Dataset> {
  const all = await listDatasets(undefined, tenant);
  const dataset: Dataset = { ...d, id: `ds_${randomUUID().slice(0, 8)}`, createdAt: Date.now() };
  all.push(dataset);
  if (tenant.id !== "local") await mkdir(tenant.root, { recursive: true });
  await writeFile(registryPath(tenant), JSON.stringify(all, null, 2));
  return dataset;
}

export async function updateDataset(id: string, patch: Partial<Dataset>, tenant: Tenant = localTenant()): Promise<Dataset | undefined> {
  const all = await listDatasets(undefined, tenant);
  const d = all.find((x) => x.id === id);
  if (!d) return undefined;
  Object.assign(d, patch);
  await writeFile(registryPath(tenant), JSON.stringify(all, null, 2));
  return d;
}

export async function getDataset(id: string, tenant: Tenant = localTenant()): Promise<Dataset | undefined> {
  return (await listDatasets(undefined, tenant)).find((d) => d.id === id);
}

export async function deleteDataset(id: string, tenant: Tenant = localTenant()): Promise<Dataset | undefined> {
  const all = await listDatasets(undefined, tenant);
  const idx = all.findIndex((d) => d.id === id);
  if (idx === -1) return undefined;
  const [removed] = all.splice(idx, 1);
  await writeFile(registryPath(tenant), JSON.stringify(all, null, 2));
  return removed;
}
