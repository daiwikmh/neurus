import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Tenant } from "../identity/credentials";

export interface AgentDef {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  dataset: string;
  datasetId: string;
  feeds: string[];
  assets: string[];
  wallets: string[];
  intervalMs: number;
  durationDays: number;
  threshold: number;
  telegram: boolean;
  createdAt: number;
}

export type AgentInput = Omit<AgentDef, "id" | "tenantId" | "createdAt">;

function registryPath(): string {
  return process.env.NEURUS_AGENTS ?? ".neurus-agents.json";
}

async function all(): Promise<AgentDef[]> {
  try {
    return JSON.parse(await readFile(registryPath(), "utf8"));
  } catch {
    return [];
  }
}

async function save(agents: AgentDef[]): Promise<void> {
  await writeFile(registryPath(), JSON.stringify(agents, null, 2));
}

export async function createAgent(tenant: Tenant, input: AgentInput): Promise<AgentDef> {
  const list = await all();
  const agent: AgentDef = {
    id: "agt_" + randomBytes(8).toString("hex"),
    tenantId: tenant.id,
    createdAt: Date.now(),
    ...input,
  };
  list.push(agent);
  await save(list);
  return agent;
}

export async function listAgents(tenant: Tenant): Promise<AgentDef[]> {
  return (await all()).filter((a) => a.tenantId === tenant.id);
}

export async function getAgentById(id: string): Promise<AgentDef | undefined> {
  return (await all()).find((a) => a.id === id.trim());
}

export async function deleteAgent(id: string, tenant: Tenant): Promise<boolean> {
  const list = await all();
  const next = list.filter((a) => !(a.id === id && a.tenantId === tenant.id));
  if (next.length === list.length) return false;
  await save(next);
  return true;
}
