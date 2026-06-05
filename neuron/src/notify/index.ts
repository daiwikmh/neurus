import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { localTenant, type Tenant } from "../identity/credentials";
import { sendTelegram } from "./telegram";

export { sendTelegram, type TelegramTarget } from "./telegram";

export interface NotifyConfig {
  telegram?: { chatId: string };
}

export interface NotifyResult {
  delivered: string[];
  skipped: string[];
}

function configPath(tenant: Tenant): string {
  return tenant.id === "local" ? process.env.NEURUS_NOTIFY ?? ".neurus-notify.json" : join(tenant.root, "notify.json");
}

export async function getNotifyConfig(tenant: Tenant = localTenant()): Promise<NotifyConfig> {
  try {
    return JSON.parse(await readFile(configPath(tenant), "utf8"));
  } catch {
    return {};
  }
}

export async function connectTelegram(chatId: string, tenant: Tenant = localTenant()): Promise<NotifyConfig> {
  const cfg = await getNotifyConfig(tenant);
  cfg.telegram = { chatId };
  if (tenant.id !== "local") await mkdir(tenant.root, { recursive: true });
  await writeFile(configPath(tenant), JSON.stringify(cfg, null, 2));
  return cfg;
}

export async function notify(text: string, tenant: Tenant = localTenant()): Promise<NotifyResult> {
  const cfg = await getNotifyConfig(tenant);
  const delivered: string[] = [];
  const skipped: string[] = [];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (cfg.telegram?.chatId) {
    if (token) {
      await sendTelegram({ token, chatId: cfg.telegram.chatId }, text);
      delivered.push("telegram");
    } else {
      skipped.push("telegram (no TELEGRAM_BOT_TOKEN)");
    }
  }
  return { delivered, skipped };
}
