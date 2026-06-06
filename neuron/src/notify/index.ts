import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { localTenant, type Tenant } from "../identity/credentials";
import { kvEnabled, kvGet, kvSet } from "../storage/kv";
import { sendTelegram } from "./telegram";

export { sendTelegram, type TelegramTarget } from "./telegram";

// Reverse index: an inbound Telegram chat id → which user + set it talks to.
export interface ChatBinding {
  user: string;
  set: string;
}

const chatKey = (chatId: string) => `telegram:chat:${chatId}`;
const indexFile = () => process.env.NEURUS_TELEGRAM ?? ".neurus-telegram.json";

export async function bindChat(chatId: string, binding: ChatBinding): Promise<void> {
  if (kvEnabled()) {
    await kvSet(chatKey(chatId), JSON.stringify(binding));
    return;
  }
  let all: Record<string, ChatBinding> = {};
  try {
    all = JSON.parse(await readFile(indexFile(), "utf8"));
  } catch {
    /* none yet */
  }
  all[chatId] = binding;
  await writeFile(indexFile(), JSON.stringify(all, null, 2));
}

export async function getChatBinding(chatId: string): Promise<ChatBinding | undefined> {
  if (kvEnabled()) {
    const raw = await kvGet(chatKey(chatId));
    return raw ? (JSON.parse(raw) as ChatBinding) : undefined;
  }
  try {
    const all = JSON.parse(await readFile(indexFile(), "utf8")) as Record<string, ChatBinding>;
    return all[chatId];
  } catch {
    return undefined;
  }
}

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
  const token = process.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_TOKEN;
  if (cfg.telegram?.chatId) {
    if (token) {
      await sendTelegram({ token, chatId: cfg.telegram.chatId }, text, { markdown: true });
      delivered.push("telegram");
    } else {
      skipped.push("telegram (no TELEGRAM_BOT_TOKEN)");
    }
  }
  return { delivered, skipped };
}
