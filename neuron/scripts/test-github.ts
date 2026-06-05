import { parseRepoUrl } from "../src/ingest/github";

const checks: [string, boolean][] = [];
const check = (n: string, c: boolean) => checks.push([n, c]);

const a = parseRepoUrl("https://github.com/MystenLabs/walrus-docs");
check("basic owner/repo", a?.owner === "MystenLabs" && a?.repo === "walrus-docs" && !a?.branch && !a?.subpath);

const b = parseRepoUrl("github.com/owner/repo.git");
check("strips .git", b?.repo === "repo");

const c = parseRepoUrl("https://github.com/owner/repo/tree/main/docs");
check("branch + subpath", c?.branch === "main" && c?.subpath === "docs");

const d = parseRepoUrl("https://github.com/owner/repo/tree/dev/docs/api/");
check("nested subpath, trailing slash trimmed", d?.branch === "dev" && d?.subpath === "docs/api");

check("ssh form", parseRepoUrl("git@github.com:owner/repo.git")?.repo === "repo");
check("rejects non-github", parseRepoUrl("https://example.com/owner/repo") === null);

let ok = true;
for (const [n, c2] of checks) { console.log(`  ${c2 ? "✓" : "✗"} ${n}`); if (!c2) ok = false; }
console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c2) => c2[1]).length}/${checks.length}) ===`);
if (!ok) process.exit(1);
