import { readdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import type { Memory } from "../core/memory";
import { ingestFile } from "./file";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "out", ".turbo", "coverage", ".cache", ".vercel"]);
const SKIP_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.tsbuildinfo"]);
export const OK_EXT = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".log", ".text", ".pdf", ".docx"]);

export async function listIngestible(dir: string, max = 50): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) return;
      if (e.isDirectory()) {
        if (!e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) await walk(join(d, e.name));
      } else if (e.isFile() && !SKIP_FILES.has(e.name) && OK_EXT.has(extname(e.name).toLowerCase())) {
        out.push(join(d, e.name));
      }
    }
  }
  await walk(dir);
  return out;
}

export interface DirResult {
  files: { name: string; chunks: number }[];
  totalChunks: number;
}

export async function ingestDir(mem: Memory, dir: string, opts: { max?: number; store?: boolean; behind?: boolean } = {}): Promise<DirResult> {
  const paths = await listIngestible(dir, opts.max ?? 50);
  const files: { name: string; chunks: number }[] = [];
  let totalChunks = 0;
  for (const p of paths) {
    const { file, chunks } = await ingestFile(p, { store: opts.store ?? false });
    await mem.ingest(file, chunks, { behind: opts.behind });
    files.push({ name: basename(p), chunks: chunks.length });
    totalChunks += chunks.length;
  }
  return { files, totalChunks };
}
