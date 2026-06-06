export function kvEnabled(): boolean {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token || token.length < 16) return false;
  try {
    const host = new URL(url).hostname;
    return url.startsWith("https://") && host.includes(".") && !host.startsWith("...");
  } catch {
    return false;
  }
}

async function cmd(args: string[]): Promise<unknown> {
  const res = await fetch(process.env.UPSTASH_REDIS_URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.UPSTASH_REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Upstash Redis ${res.status}: ${await res.text().catch(() => "")}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`Upstash Redis: ${data.error}`);
  return data.result;
}

export async function kvGet(key: string): Promise<string | null> {
  const r = await cmd(["GET", key]);
  return (r as string | null) ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await cmd(["SET", key, value]);
}

export async function kvDel(key: string): Promise<void> {
  await cmd(["DEL", key]);
}
