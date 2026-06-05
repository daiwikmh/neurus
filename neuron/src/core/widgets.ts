import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Tenant } from "../identity/credentials";

export interface Widget {
  id: string;
  tenantId: string;
  set: string;
  name: string;
  origins: string[];
  createdAt: number;
}

function registryPath(): string {
  return process.env.NEURUS_WIDGETS ?? ".neurus-widgets.json";
}

async function all(): Promise<Widget[]> {
  try {
    return JSON.parse(await readFile(registryPath(), "utf8"));
  } catch {
    return [];
  }
}

async function save(widgets: Widget[]): Promise<void> {
  await writeFile(registryPath(), JSON.stringify(widgets, null, 2));
}

export async function createWidget(tenant: Tenant, set: string, name: string, origins: string[] = []): Promise<Widget> {
  const list = await all();
  const widget: Widget = {
    id: "wgt_" + randomBytes(12).toString("hex"),
    tenantId: tenant.id,
    set,
    name,
    origins: origins.map((o) => o.trim()).filter(Boolean),
    createdAt: Date.now(),
  };
  list.push(widget);
  await save(list);
  return widget;
}

export async function listWidgets(tenant: Tenant, set?: string): Promise<Widget[]> {
  return (await all()).filter((w) => w.tenantId === tenant.id && (!set || w.set === set));
}

export async function getWidget(id: string): Promise<Widget | undefined> {
  return (await all()).find((w) => w.id === id);
}

export async function deleteWidget(id: string, tenant: Tenant): Promise<boolean> {
  const list = await all();
  const next = list.filter((w) => !(w.id === id && w.tenantId === tenant.id));
  if (next.length === list.length) return false;
  await save(next);
  return true;
}
