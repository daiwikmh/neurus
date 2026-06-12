import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Tenant } from "../identity/credentials";

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

function registryPath(): string {
  return process.env.NEURUS_FEEDS ?? ".neurus-feeds.json";
}

async function all(): Promise<Feed[]> {
  try {
    return JSON.parse(await readFile(registryPath(), "utf8"));
  } catch {
    return [];
  }
}

async function save(feeds: Feed[]): Promise<void> {
  await writeFile(registryPath(), JSON.stringify(feeds, null, 2));
}

export async function createFeed(
  tenant: Tenant,
  f: { set: string; name: string; shareId: string; capId: string; blobId: string; identity: string; neurons: number },
): Promise<Feed> {
  const list = await all();
  const feed: Feed = {
    id: "feed_" + randomBytes(8).toString("hex"),
    tenantId: tenant.id,
    set: f.set,
    name: f.name,
    shareId: f.shareId,
    capId: f.capId,
    blobId: f.blobId,
    identity: f.identity,
    neurons: f.neurons,
    createdAt: Date.now(),
    grants: [],
  };
  list.push(feed);
  await save(list);
  return feed;
}

export async function listFeeds(tenant: Tenant, set?: string): Promise<Feed[]> {
  return (await all()).filter((f) => f.tenantId === tenant.id && (!set || f.set === set));
}

export async function getFeed(id: string, tenant: Tenant): Promise<Feed | undefined> {
  return (await all()).find((f) => f.id === id && f.tenantId === tenant.id);
}

export async function deleteFeed(id: string, tenant: Tenant): Promise<boolean> {
  const list = await all();
  const next = list.filter((f) => !(f.id === id && f.tenantId === tenant.id));
  if (next.length === list.length) return false;
  await save(next);
  return true;
}

async function mutateGrants(id: string, tenant: Tenant, fn: (g: string[]) => string[]): Promise<Feed | undefined> {
  const list = await all();
  const feed = list.find((f) => f.id === id && f.tenantId === tenant.id);
  if (!feed) return undefined;
  feed.grants = fn(feed.grants);
  await save(list);
  return feed;
}

export async function addGrant(id: string, tenant: Tenant, address: string): Promise<Feed | undefined> {
  return mutateGrants(id, tenant, (g) => (g.includes(address) ? g : [...g, address]));
}

export async function removeGrant(id: string, tenant: Tenant, address: string): Promise<Feed | undefined> {
  return mutateGrants(id, tenant, (g) => g.filter((a) => a !== address));
}
