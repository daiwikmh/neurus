import { extract, canonicalize, parseRobots, isPrivateHost, pageToNeurons } from "../src/ingest/web";

const HTML = `<!doctype html><html><head><title>Quilt — Walrus Docs</title></head>
<body>
<nav><a href="/">Home</a><a href="/about">About</a> Cookie consent banner please accept</nav>
<header>Walrus Documentation Header Navigation Menu</header>
<article>
<h1>Quilt</h1>
<p>Quilt is a batch storage solution that bundles up to 660 small files into a single unit. It uses RedStuff erasure coding to store data efficiently across the Walrus network of storage nodes.</p>
<p>Each file in a Quilt stays individually retrievable by its identifier and tags, without unbundling the whole batch, which makes it ideal for NFT collections, documents, and logs.</p>
<h2>Cost</h2>
<p>Quilt can reduce storage costs for small blobs by up to 420x compared to storing them individually on chain.</p>
</article>
<footer>Copyright 2026 Walrus Foundation. Cookie consent and privacy policy links live down here.</footer>
</body></html>`;

const checks: [string, boolean][] = [];
const check = (n: string, c: boolean) => checks.push([n, c]);

const ex = extract(HTML, "https://docs.wal.app/quilt");
check("extract returns content", !!ex);
check("keeps article body (RedStuff)", !!ex && ex.markdown.includes("RedStuff"));
check("keeps article body (420x)", !!ex && ex.markdown.includes("420x"));
check("strips nav/footer noise (no 'Cookie consent')", !!ex && !ex.markdown.includes("Cookie consent"));
check("title from page", !!ex && /Quilt/.test(ex.title));

check("canonicalize strips utm + hash + trailing slash", canonicalize("https://x.com/a/?utm_source=z#f") === "https://x.com/a");
check("canonicalize resolves relative", canonicalize("/page", "https://x.com/docs/") === "https://x.com/page");
check("canonicalize rejects non-http", canonicalize("ftp://x.com/a") === null);

const robots = parseRobots("User-agent: *\nDisallow: /private\nDisallow: /admin\nUser-agent: Googlebot\nDisallow: /");
check("robots parses our disallow only", robots.length === 2 && robots.includes("/private") && robots.includes("/admin"));

check("private host: localhost", isPrivateHost("localhost"));
check("private host: 127.x", isPrivateHost("127.0.0.1"));
check("private host: 192.168.x", isPrivateHost("192.168.1.5"));
check("public host allowed", !isPrivateHost("docs.wal.app"));

if (ex) {
  const { source, chunks } = pageToNeurons("https://docs.wal.app/quilt", ex.title, ex.markdown);
  check("source neuron carries url", source.meta?.url === "https://docs.wal.app/quilt" && source.type === "file");
  check("chunks produced + linked", chunks.length >= 1 && chunks[0].synapses.some((s) => s.to === source.id));
}

let ok = true;
for (const [n, c] of checks) { console.log(`  ${c ? "✓" : "✗"} ${n}`); if (!c) ok = false; }
console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
if (!ok) process.exit(1);
