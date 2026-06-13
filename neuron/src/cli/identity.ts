import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { safeTenantId, envCredentials, type Tenant } from "../identity/credentials";

export interface AgentIdentity {
  name: string;
  address: string;
  secretKey: string;
  createdAt: number;
}

const DIR = join(homedir(), ".neurus");
const FILE = join(DIR, "agent.json");
export const identityPath = FILE;

export async function loadIdentity(): Promise<AgentIdentity | null> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as AgentIdentity;
  } catch {
    return null;
  }
}

export async function createIdentity(name: string): Promise<AgentIdentity> {
  const kp = Ed25519Keypair.generate();
  const id: AgentIdentity = {
    name: name.trim() || "agent",
    address: kp.getPublicKey().toSuiAddress(),
    secretKey: kp.getSecretKey(),
    createdAt: Date.now(),
  };
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(id, null, 2), { mode: 0o600 });
  return id;
}

export function tenantFor(id: AgentIdentity): Tenant {
  return { id: safeTenantId(id.address), root: ".", credentials: envCredentials() };
}

export const shortAddr = (a: string): string => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
