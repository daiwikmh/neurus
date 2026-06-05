import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { createNeuron, link, type Neuron } from "../core/neuron";
import { chunkText } from "./chunk";

export interface CrawlOptions {
  max?: number;
  maxDepth?: number;
  pathPrefix?: string;
  delayMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface CrawlResult {
  root: string;
  host: string;
  ingested: { source: Neuron; chunks: Neuron[] }[];
  pages: number;
  failed: string[];
  skipped: number;
}

const UA = "NeurusDocsBot/1.0 (+https://neurus.dev)";

export function canonicalize(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (/^utm_|^ref$|^fbclid$|^gclid$/i.test(p)) u.searchParams.delete(p);
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

async function fetchText(url: string, opts: { timeoutMs: number; maxBytes: number }): Promise<{ text: string; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml" }, signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len && len > opts.maxBytes) return null;
    const text = (await res.text()).slice(0, opts.maxBytes);
    return { text, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseRobots(text: string): string[] {
  const disallow: string[] = [];
  let appliesToUs = false;
  for (const line of text.split("\n")) {
    const [rawKey, ...rest] = line.split("#")[0].split(":");
    const key = rawKey.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") appliesToUs = val === "*";
    else if (key === "disallow" && appliesToUs && val) disallow.push(val);
  }
  return disallow;
}

function allowed(url: string, origin: string, disallow: string[]): boolean {
  const path = url.slice(origin.length) || "/";
  return !disallow.some((d) => path.startsWith(d));
}

async function discoverSitemap(origin: string, opts: { timeoutMs: number; maxBytes: number }, depth = 0): Promise<string[]> {
  if (depth > 2) return [];
  const res = await fetchText(`${origin}/sitemap.xml`, opts);
  if (!res || depth > 0) {
    if (!res) return [];
  }
  const xml = res.text;
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  if (/<sitemapindex/i.test(xml)) {
    const out: string[] = [];
    for (const sm of locs.slice(0, 10)) {
      const child = await fetchText(sm, opts);
      if (child) out.push(...[...child.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim()));
    }
    return out;
  }
  return locs;
}

export function extract(html: string, url: string): { title: string; markdown: string } | null {
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url });
  } catch {
    return null;
  }
  const doc = dom.window.document;
  doc.querySelectorAll("script,style,noscript,svg,form,iframe").forEach((el) => el.remove());
  try {
    const article = new Readability(doc.cloneNode(true) as Document).parse();
    if (article?.content) {
      const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
      const markdown = td.turndown(article.content).replace(/\n{3,}/g, "\n\n").trim();
      if (markdown.length > 80) return { title: (article.title || doc.title || url).trim(), markdown };
    }
  } catch {
    /* fall through to plain text */
  }
  doc.querySelectorAll("nav,footer,header,aside").forEach((el) => el.remove());
  const text = (doc.body?.textContent ?? "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > 80 ? { title: (doc.title || url).trim(), markdown: text } : null;
}

function sameOriginLinks(html: string, pageUrl: string, origin: string): string[] {
  try {
    const doc = new JSDOM(html, { url: pageUrl }).window.document;
    const out = new Set<string>();
    for (const a of doc.querySelectorAll("a[href]")) {
      const c = canonicalize(a.getAttribute("href") ?? "", pageUrl);
      if (c && c.startsWith(origin)) out.add(c);
    }
    return [...out];
  } catch {
    return [];
  }
}

export function pageToNeurons(url: string, title: string, markdown: string): { source: Neuron; chunks: Neuron[] } {
  const hash = createHash("sha256").update(markdown).digest("hex").slice(0, 16);
  const summary = markdown.replace(/\s+/g, " ").trim().slice(0, 280);
  const source = createNeuron({ type: "file", title, body: summary, meta: { url, mime: "text/html", contentHash: hash, source: "web" } });
  const chunks = chunkText(markdown).map((body, i) => {
    const c = createNeuron({ type: "chunk", title: `${title}#${i + 1}`, body, meta: { index: i, file: source.id, url } });
    link(c, source.id, "derived_from");
    return c;
  });
  return { source, chunks };
}

export async function ingestSite(rootRaw: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const root = canonicalize(rootRaw);
  if (!root) throw new Error(`invalid URL: ${rootRaw}`);
  const rootUrl = new URL(root);
  if (isPrivateHost(rootUrl.hostname)) throw new Error("refusing to crawl a private/local host");
  const origin = rootUrl.origin;
  const max = Math.min(opts.max ?? 25, 200);
  const maxDepth = opts.maxDepth ?? 3;
  const delayMs = opts.delayMs ?? 300;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const pathPrefix = opts.pathPrefix ?? rootUrl.pathname.replace(/[^/]*$/, "");
  const fetchOpts = { timeoutMs, maxBytes };

  const robotsRes = await fetchText(`${origin}/robots.txt`, fetchOpts);
  const disallow = robotsRes ? parseRobots(robotsRes.text) : [];

  const seeds = (await discoverSitemap(origin, fetchOpts))
    .map((u) => canonicalize(u))
    .filter((u): u is string => !!u && u.startsWith(origin) && u.startsWith(`${origin}${pathPrefix}`));

  const queue: { url: string; depth: number }[] = (seeds.length ? seeds : [root]).map((url) => ({ url, depth: 0 }));
  const seenUrls = new Set<string>();
  const seenHashes = new Set<string>();
  const result: CrawlResult = { root, host: rootUrl.hostname, ingested: [], pages: 0, failed: [], skipped: 0 };

  while (queue.length && result.ingested.length < max) {
    const { url, depth } = queue.shift()!;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    if (!allowed(url, origin, disallow)) { result.skipped++; continue; }

    const page = await fetchText(url, fetchOpts);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (!page || !/text\/html|xml/.test(page.contentType)) { result.failed.push(url); continue; }

    const content = extract(page.text, url);
    if (!content) { result.failed.push(url); continue; }

    const hash = createHash("sha256").update(content.markdown).digest("hex").slice(0, 16);
    if (seenHashes.has(hash)) { result.skipped++; continue; }
    seenHashes.add(hash);

    result.ingested.push(pageToNeurons(url, content.title, content.markdown));

    if (!seeds.length && depth < maxDepth) {
      for (const next of sameOriginLinks(page.text, url, origin)) {
        if (!seenUrls.has(next) && next.startsWith(`${origin}${pathPrefix}`)) queue.push({ url: next, depth: depth + 1 });
      }
    }
  }

  result.pages = result.ingested.length;
  return result;
}

export async function ingestUrl(url: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  return ingestSite(url, { ...opts, max: 1, maxDepth: 0 });
}
