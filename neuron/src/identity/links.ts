import { readFile, writeFile } from "node:fs/promises";
import { kvEnabled, kvGet, kvSet } from "../storage/kv";

const KV_KEY = process.env.NEURUS_LINKS_KV ?? "neurus:links";
const PATH = process.env.NEURUS_LINKS ?? ".neurus-links.json";

async function all(): Promise<Record<string, string>> {
  const body = kvEnabled() ? await kvGet(KV_KEY) : await readFile(PATH, "utf8").catch(() => null);
  return body ? (JSON.parse(body) as Record<string, string>) : {};
}

async function writeAll(map: Record<string, string>): Promise<void> {
  const body = JSON.stringify(map, null, 2);
  if (kvEnabled()) await kvSet(KV_KEY, body);
  else await writeFile(PATH, body);
}

export async function getLink(key: string): Promise<string | undefined> {
  return (await all())[key];
}

export async function setLink(key: string, value: string): Promise<void> {
  const map = await all();
  if (map[key] === value) return;
  map[key] = value;
  await writeAll(map);
}
