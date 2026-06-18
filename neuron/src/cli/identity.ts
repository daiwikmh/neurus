import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
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

function keypairFromSecret(secretKey: string): Ed25519Keypair {
  const raw = secretKey.trim();
  if (raw.startsWith("suiprivkey")) {
    const { secretKey: bytes } = decodeSuiPrivateKey(raw);
    return Ed25519Keypair.fromSecretKey(bytes);
  }
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("invalid private key — expected suiprivkey1… (bech32) or a 32-byte hex key");
  }
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, "hex")));
}

export async function importIdentity(name: string, secretKey: string): Promise<AgentIdentity> {
  const kp = keypairFromSecret(secretKey);
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
