import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface McpConfig {
  memwalAccountId: string;
  memwalDelegateKey: string;
  memwalServerUrl?: string;
  nvidiaApiKey?: string;
  sealPackage?: string;
  suiPrivateKey?: string;
}

const DIR = join(homedir(), ".neurus");
const FILE = join(DIR, "mcp.json");

export async function loadMcpConfig(): Promise<McpConfig | null> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as McpConfig;
  } catch {
    return null;
  }
}

export async function saveMcpConfig(cfg: McpConfig): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function applyMcpConfig(cfg: McpConfig): void {
  process.env.MEMWAL_ACCOUNT_ID = cfg.memwalAccountId;
  process.env.MEMWAL_DELEGATE_KEY = cfg.memwalDelegateKey;
  if (cfg.memwalServerUrl) process.env.MEMWAL_RELAYER_URL = cfg.memwalServerUrl;
  if (cfg.nvidiaApiKey) process.env.NVIDIA_API_KEY = cfg.nvidiaApiKey;
  if (cfg.sealPackage) process.env.NEURUS_SEAL_PACKAGE = cfg.sealPackage;
  if (cfg.suiPrivateKey) process.env.SUI_TESTNET_PRIVATE_KEY = cfg.suiPrivateKey;
}

export const mcpConfigPath = FILE;
