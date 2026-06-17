import { withRetry, RetryableError, isNetworkError } from "../util/retry";
import { orChat, orChatStream } from "./openrouter";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const primaryModel = () => process.env.NVIDIA_MODEL ?? "openai/gpt-oss-120b";
const FREE_OR_MODEL = process.env.NVIDIA_FALLBACK_OR_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free";

const retryOpts = (label: string, attempts: number) => ({
  label,
  attempts,
  shouldRetry: (e: unknown) => e instanceof RetryableError || isNetworkError(e),
});

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

async function callOnce(system: string, user: string, opts: ChatOptions): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: primaryModel(),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: opts.maxTokens ?? 700,
        temperature: opts.temperature ?? 0.3,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        throw new RetryableError(`NVIDIA API HTTP ${res.status}: ${body}`, Number.isFinite(ra) ? ra * 1000 : undefined);
      }
      throw new Error(`NVIDIA API HTTP ${res.status}: ${body}`);
    }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(system: string, user: string, opts: ChatOptions = {}): Promise<string> {
  try {
    return await withRetry(() => callOnce(system, user, opts), retryOpts(`LLM (NVIDIA ${primaryModel()})`, 1));
  } catch {
    return withRetry(
      () => orChat(system, user, { model: FREE_OR_MODEL, tier: "free" as const, maxTokens: opts.maxTokens, temperature: opts.temperature, timeoutMs: opts.timeoutMs }),
      retryOpts(`LLM (OR free ${FREE_OR_MODEL})`, 2),
    );
  }
}

async function openNvidiaStream(system: string, user: string, opts: ChatOptions): Promise<Response> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model: primaryModel(),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: opts.maxTokens ?? 700,
        temperature: opts.temperature ?? 0.3,
        stream: true,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`NVIDIA API HTTP ${res.status}: ${body}`);
    throw new Error(`NVIDIA API HTTP ${res.status}: ${body}`);
  }
  if (!res.body) throw new RetryableError("NVIDIA stream: no response body");
  return res;
}

async function drainNvidiaStream(res: Response, onToken: (t: string) => void): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const tok = JSON.parse(data).choices?.[0]?.delta?.content;
        if (tok) { full += tok; onToken(tok); }
      } catch { /* keepalive / partial line */ }
    }
  }
  return full;
}

export async function chatStream(system: string, user: string, onToken: (t: string) => void, opts: ChatOptions = {}): Promise<string> {
  try {
    const res = await withRetry(() => openNvidiaStream(system, user, opts), retryOpts(`LLM stream (NVIDIA ${primaryModel()})`, 1));
    return drainNvidiaStream(res, onToken);
  } catch {
    return withRetry(
      () => orChatStream(system, user, onToken, { model: FREE_OR_MODEL, tier: "free", maxTokens: opts.maxTokens, temperature: opts.temperature }),
      retryOpts(`LLM stream (OR free ${FREE_OR_MODEL})`, 2),
    );
  }
}

export async function chatJSON<T>(
  system: string,
  user: string,
  schema: { parse(value: unknown): T },
  retries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const raw = await chat(system, user, { temperature: 0.2, maxTokens: 900 });
      return schema.parse(JSON.parse(extractJson(raw)));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`chatJSON failed after ${retries} attempts: ${(lastErr as Error)?.message ?? lastErr}`);
}

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1) return s.slice(first, last + 1);
  return s.trim();
}
