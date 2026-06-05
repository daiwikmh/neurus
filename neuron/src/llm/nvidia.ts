import { withRetry, RetryableError, isNetworkError } from "../util/retry";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = process.env.NVIDIA_MODEL ?? "openai/gpt-oss-120b";

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

async function callOnce(system: string, user: string, opts: ChatOptions): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY in environment");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  try {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
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
  return withRetry(() => callOnce(system, user, opts), {
    label: "LLM (NVIDIA)",
    attempts: 3,
    shouldRetry: (e) => e instanceof RetryableError || isNetworkError(e),
  });
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
