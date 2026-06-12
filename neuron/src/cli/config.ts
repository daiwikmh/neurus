import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Provider = "nvidia" | "openrouter";

export interface CliConfig {
  provider: Provider;
  apiKey: string;
  model: string;
}

export const DEFAULT_MODEL: Record<Provider, string> = {
  nvidia: "openai/gpt-oss-120b",
  openrouter: "deepseek/deepseek-v4-flash",
};

const DIR = join(homedir(), ".neurus");
const FILE = join(DIR, "config.json");

export async function loadConfig(): Promise<CliConfig | null> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as CliConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(cfg: CliConfig): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function applyConfig(cfg: CliConfig): void {
  if (cfg.provider === "openrouter") process.env.OPENROUTER_API_KEY = cfg.apiKey;
  else process.env.NVIDIA_API_KEY = cfg.apiKey;
}

export const configPath = FILE;
