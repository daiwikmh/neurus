import { extname } from "node:path";
import { OK_EXT } from "./dir";

const UA = "NeurusDocsBot/1.0 (+https://neurus.dev)";

export interface RepoRef {
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
}

export interface RepoFiles {
  repo: string;
  url: string;
  branch: string;
  items: { name: string; bytes: Buffer }[];
  skipped: number;
}

export function parseRepoUrl(raw: string): RepoRef | null {
  const m = raw.trim().match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.*))?)?(?:[#?].*)?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: m[3] || undefined, subpath: (m[4] || "").replace(/\/+$/, "") || undefined };
}

async function gh(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/vnd.github+json" } });
  if (!res.ok) {
    if (res.status === 403) throw new Error("GitHub API rate limit hit (60/hr unauthenticated) — try again later");
    if (res.status === 404) throw new Error("repo, branch, or path not found (private repo?)");
    throw new Error(`GitHub API HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchRepoFiles(rawUrl: string, opts: { max?: number } = {}): Promise<RepoFiles> {
  const ref = parseRepoUrl(rawUrl);
  if (!ref) throw new Error("expected a github.com/owner/repo URL");
  const { owner, repo, subpath } = ref;
  const branch = ref.branch ?? (await gh(`https://api.github.com/repos/${owner}/${repo}`)).default_branch ?? "main";
  const tree = await gh(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const max = Math.min(opts.max ?? 100, 300);

  const blobs: string[] = (tree.tree ?? [])
    .filter(
      (t: any) =>
        t.type === "blob" &&
        OK_EXT.has(extname(t.path).toLowerCase()) &&
        !t.path.split("/").some((seg: string) => seg.startsWith(".")) &&
        (!subpath || t.path === subpath || t.path.startsWith(`${subpath}/`)),
    )
    .map((t: any) => t.path);
  const picked = blobs.slice(0, max);

  const items: { name: string; bytes: Buffer }[] = [];
  for (const path of picked) {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, { headers: { "user-agent": UA } });
      if (r.ok) items.push({ name: path, bytes: Buffer.from(await r.arrayBuffer()) });
      await new Promise((res) => setTimeout(res, 60));
    } catch {
      /* skip unreachable file */
    }
  }

  return { repo: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}`, branch, items, skipped: blobs.length - picked.length };
}
