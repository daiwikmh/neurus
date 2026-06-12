import { withRetry, RetryableError, isNetworkError } from "../util/retry";

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

// Hard ceiling so a single flat-unlock user cannot drain the shared key with huge completions.
const MAX_OUTPUT_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS ?? 1000);

export interface ChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

function key(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("Missing OPENROUTER_API_KEY in environment");
  return k;
}

function cap(n: number | undefined): number {
  return Math.min(n ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);
}

async function callOnce(system: string, user: string, opts: ChatOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  try {
    const res = await fetch(OR_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: cap(opts.maxTokens),
        temperature: opts.temperature ?? 0.3,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        throw new RetryableError(`OpenRouter HTTP ${res.status}: ${body}`, Number.isFinite(ra) ? ra * 1000 : undefined);
      }
      throw new Error(`OpenRouter HTTP ${res.status}: ${body}`);
    }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

export async function orChat(system: string, user: string, opts: ChatOptions): Promise<string> {
  return withRetry(() => callOnce(system, user, opts), {
    label: "LLM (OpenRouter)",
    attempts: 3,
    shouldRetry: (e) => e instanceof RetryableError || isNetworkError(e),
  });
}

async function openStream(system: string, user: string, opts: ChatOptions): Promise<Response> {
  const res = await fetch(OR_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: cap(opts.maxTokens),
      temperature: opts.temperature ?? 0.3,
      stream: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`OpenRouter HTTP ${res.status}: ${body}`);
    throw new Error(`OpenRouter HTTP ${res.status}: ${body}`);
  }
  if (!res.body) throw new RetryableError("OpenRouter stream: no response body");
  return res;
}

export async function orChatStream(system: string, user: string, onToken: (t: string) => void, opts: ChatOptions): Promise<string> {
  const res = await withRetry(() => openStream(system, user, opts), {
    label: "LLM (OpenRouter) stream",
    attempts: 3,
    shouldRetry: (e) => e instanceof RetryableError || isNetworkError(e),
  });
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
        if (tok) {
          full += tok;
          onToken(tok);
        }
      } catch {
        /* keepalive / partial line */
      }
    }
  }
  return full;
}
