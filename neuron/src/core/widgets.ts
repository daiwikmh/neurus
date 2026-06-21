import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Tenant } from "../identity/credentials";
import { kvEnabled, kvGet, kvSet, kvDel } from "../storage/kv";

export interface Widget {
  id: string;
  tenantId: string;
  set: string;
  name: string;
  origins: string[];
  datasetId?: string;
  createdAt: number;
}

function registryPath(): string {
  return process.env.NEURUS_WIDGETS ?? ".neurus-widgets.json";
}

function useKv(tenant: Tenant): boolean {
  return kvEnabled() && tenant.id !== "local";
}

function tenantKey(tenant: Tenant): string {
  return `neurus:widgets:${tenant.id}`;
}

function idKey(id: string): string {
  return `neurus:widget:${id}`;
}

async function loadTenant(tenant: Tenant): Promise<Widget[]> {
  if (useKv(tenant)) {
    const raw = await kvGet(tenantKey(tenant));
    return raw ? JSON.parse(raw) : [];
  }
  try {
    const all: Widget[] = JSON.parse(await readFile(registryPath(), "utf8"));
    return all.filter((w) => w.tenantId === tenant.id);
  } catch {
    return [];
  }
}

async function saveTenant(widgets: Widget[], tenant: Tenant): Promise<void> {
  if (useKv(tenant)) {
    await kvSet(tenantKey(tenant), JSON.stringify(widgets));
    return;
  }
  let all: Widget[] = [];
  try {
    all = JSON.parse(await readFile(registryPath(), "utf8"));
  } catch {}
  const others = all.filter((w) => w.tenantId !== tenant.id);
  await writeFile(registryPath(), JSON.stringify([...others, ...widgets], null, 2));
}

async function fileGetWidget(id: string): Promise<Widget | undefined> {
  try {
    const all: Widget[] = JSON.parse(await readFile(registryPath(), "utf8"));
    return all.find((w) => w.id === id);
  } catch {
    return undefined;
  }
}

export async function createWidget(tenant: Tenant, set: string, name: string, origins: string[] = [], datasetId?: string): Promise<Widget> {
  const list = await loadTenant(tenant);
  const widget: Widget = {
    id: "wgt_" + randomBytes(12).toString("hex"),
    tenantId: tenant.id,
    set,
    name,
    origins: origins.map((o) => o.trim()).filter(Boolean),
    datasetId: datasetId || undefined,
    createdAt: Date.now(),
  };
  list.push(widget);
  await saveTenant(list, tenant);
  if (useKv(tenant)) {
    await kvSet(idKey(widget.id), JSON.stringify(widget));
  }
  return widget;
}

export async function listWidgets(tenant: Tenant, set?: string): Promise<Widget[]> {
  const list = await loadTenant(tenant);
  return set ? list.filter((w) => w.set === set) : list;
}

export async function getWidget(id: string): Promise<Widget | undefined> {
  if (kvEnabled()) {
    const raw = await kvGet(idKey(id));
    return raw ? JSON.parse(raw) : undefined;
  }
  return fileGetWidget(id);
}

export async function deleteWidget(id: string, tenant: Tenant): Promise<boolean> {
  const list = await loadTenant(tenant);
  const next = list.filter((w) => w.id !== id);
  if (next.length === list.length) return false;
  await saveTenant(next, tenant);
  if (useKv(tenant)) {
    await kvDel(idKey(id));
  }
  return true;
}
