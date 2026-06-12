import { readFile, writeFile } from "node:fs/promises";

const FILE = ".neurus-billing.json";

export interface BillingEntry {
  paid: boolean;
  txDigest?: string;
  amountSui?: number;
  at?: number;
}

type Store = Record<string, BillingEntry>;

let cache: Store | null = null;

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE, "utf8")) as Store;
  } catch {
    cache = {};
  }
  return cache;
}

export async function isPaid(tenantId: string): Promise<boolean> {
  if (tenantId === "local") return true;
  const s = await load();
  return s[tenantId]?.paid === true;
}

export async function getEntry(tenantId: string): Promise<BillingEntry> {
  const s = await load();
  return s[tenantId] ?? { paid: false };
}

export async function markPaid(tenantId: string, info: { txDigest: string; amountSui: number }): Promise<void> {
  const s = await load();
  s[tenantId] = { paid: true, txDigest: info.txDigest, amountSui: info.amountSui, at: Date.now() };
  await writeFile(FILE, JSON.stringify(s, null, 2));
}
