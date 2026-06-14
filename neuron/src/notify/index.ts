import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { localTenant, type Tenant } from "../identity/credentials";
import { kvEnabled, kvGet, kvSet } from "../storage/kv";
import { sendTelegram } from "./telegram";

export { sendTelegram, type TelegramTarget } from "./telegram";

// One-time deep-link tokens for the "tap to connect" Telegram flow. Short-lived; the
// user opens t.me/<bot>?start=<token>, presses Start, and the webhook binds their chat.
interface LinkToken { user: string; set: string; exp: number }
const linkTokens = new Map<string, LinkToken>();

export function mintLinkToken(user: string, set: string, ttlMs = 600_000): string {
  const token = randomBytes(9).toString("base64url");
  linkTokens.set(token, { user, set, exp: Date.now() + ttlMs });
  return token;
}

export function consumeLinkToken(token: string): { user: string; set: string } | undefined {
  const t = linkTokens.get(token);
  if (!t) return undefined;
  linkTokens.delete(token);
  if (t.exp < Date.now()) return undefined;
  return { user: t.user, set: t.set };
}

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
