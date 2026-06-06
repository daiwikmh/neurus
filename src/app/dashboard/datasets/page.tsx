"use client";

import { useEffect, useRef, useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus, type Dataset, type BlobHealth, type Widget } from "@/services/neurus";

const KIND_LABEL: Record<Dataset["kind"], string> = { file: "file", snapshot: "snapshot", import: "import", web: "web docs", folder: "folder", github: "github" };
const walruscan = (blobId: string) => `https://walruscan.com/testnet/blob/${blobId}`;
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };
const STRUCTURE = new Set(["web", "folder", "github"]);
const DOC_EXT = /\.(txt|md|markdown|csv|json|log|text|pdf|docx)$/i;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fmtBytes(b?: number): string {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function HealthBadge({ set, objectId }: { set: string; objectId?: string }) {
  const [h, setH] = useState<BlobHealth | null>(null);
  const [state, setState] = useState<"load" | "ok" | "err">("load");
  useEffect(() => {
    if (!objectId) return;
    let alive = true;
    neurus.datasetHealth(set, objectId).then((r) => alive && (setH(r), setState("ok"))).catch(() => alive && setState("err"));
    return () => { alive = false; };
  }, [set, objectId]);

  if (!objectId) return <span className="text-[11px] text-white/30">no on-chain object</span>;
  if (state === "err") return <span className="text-[11px] text-white/30">health unavailable</span>;
  if (state === "load" || !h) return <span className="text-[11px] text-white/30">checking on-chain…</span>;
  const rem = h.epochsRemaining;
  const color = h.expired ? "#ef4444" : rem != null && rem <= 1 ? "#f59e0b" : "#22c55e";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-white/60" title={`certified epoch ${h.certifiedEpoch ?? "?"} · ends epoch ${h.endEpoch} · now ${h.currentEpoch ?? "?"}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {h.expired ? "expired" : h.certified ? "certified on Sui" : "pending"}
      {rem != null && !h.expired && <span className="text-white/40"> · expires in {rem} epoch{rem === 1 ? "" : "s"}</span>}
    </span>
  );
}

export default function DatasetsPage() {
  const { active, online } = useSets();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [blobInput, setBlobInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const refresh = () => {
    neurus.datasets(active).then(setDatasets).catch(() => {});
    neurus.widgets(active).then(setWidgets).catch(() => {});
  };
  useEffect(() => { if (online) refresh(); }, [active, online]);

  const snippet = (id: string) => `<script src="${origin}/embed.js" data-widget="${id}" defer></script>`;
  const copy = (text: string) => navigator.clipboard?.writeText(text);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File) => {
    const content = await toBase64(file);
    await run("upload", () => neurus.uploadDataset(active, file.name, content));
  };

  const onFolder = async (list: FileList) => {
    const picked = [...list].filter((f) => DOC_EXT.test(f.name) && f.size < 1_500_000).slice(0, 200);
    if (picked.length === 0) {
      setErr("no ingestible docs in that folder (md/txt/csv/json/log/pdf/docx)");
      return;
    }
    const rel = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const files = await Promise.all(picked.map(async (f) => ({ path: rel(f), content: await toBase64(f) })));
    const name = rel(picked[0]).split("/")[0] || "folder";
    await run("folder", () => neurus.addFolderDataset(active, name, files));
  };

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Datasets</h1>
      <p className="mt-1 text-sm text-white/45">
        Put data on Walrus, watch it certify on Sui, and make it askable in <span className="font-mono text-white/70">{active}</span>.
      </p>

      {!online && <div className="mt-4 text-[12px] text-amber-400/80">Can&apos;t reach your memory engine — check your connection.</div>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-[#9aa8f0]/40 disabled:opacity-40"
        >
          <div className="text-sm font-medium text-white">{busy === "upload" ? "Uploading…" : "Upload a file"}</div>
          <div className="mt-1 text-[12px] text-white/40">txt · md · csv · json · pdf · docx → Walrus + askable</div>
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />

        <button
          onClick={() => run("publish", () => neurus.publishDataset(active))}
          disabled={!!busy}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-[#9aa8f0]/40 disabled:opacity-40"
        >
          <div className="text-sm font-medium text-white">{busy === "publish" ? "Publishing…" : "Publish set snapshot"}</div>
          <div className="mt-1 text-[12px] text-white/40">the whole set as one Walrus blob</div>
        </button>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-medium text-white">{busy === "web" ? "Crawling…" : "Add docs from URL"}</div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://docs.example.com"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c0d10] px-2.5 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-white/25"
            />
            <button
              onClick={() => urlInput.trim() && run("web", () => neurus.addWebDataset(active, urlInput.trim()).then(() => setUrlInput("")))}
              disabled={!!busy || !urlInput.trim()}
              className="rounded-lg bg-[#9aa8f0] px-3 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40"
            >
              Crawl
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-medium text-white">Import a Walrus blob</div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={blobInput}
              onChange={(e) => setBlobInput(e.target.value)}
              placeholder="blob id"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c0d10] px-2.5 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-white/25"
            />
            <button
              onClick={() => blobInput.trim() && run("import", () => neurus.importDataset(active, blobInput.trim()).then(() => setBlobInput("")))}
              disabled={!!busy || !blobInput.trim()}
              className="rounded-lg bg-[#9aa8f0] px-3 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-sm font-medium text-white">{busy === "github" ? "Importing repo…" : "Import GitHub repo"}</div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="github.com/owner/repo"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c0d10] px-2.5 py-1.5 font-mono text-[11px] text-white/80 outline-none focus:border-white/25"
            />
            <button
              onClick={() => repoInput.trim() && run("github", () => neurus.addRepoDataset(active, repoInput.trim()).then(() => setRepoInput("")))}
              disabled={!!busy || !repoInput.trim()}
              className="rounded-lg bg-[#9aa8f0] px-3 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40"
            >
              Import
            </button>
          </div>
        </div>

        <button
          onClick={() => folderRef.current?.click()}
          disabled={!!busy}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-[#9aa8f0]/40 disabled:opacity-40"
        >
          <div className="text-sm font-medium text-white">{busy === "folder" ? "Uploading folder…" : "Upload a folder"}</div>
          <div className="mt-1 text-[12px] text-white/40">an entire docs tree (md · txt · pdf · docx…) → askable</div>
        </button>
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onFolder(e.target.files)}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </div>

      {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-[13px] text-red-300">{err}</div>}

      <div className="mt-8 space-y-2.5">
        {datasets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
            No datasets yet. Upload a file or publish a snapshot — it lands on Walrus and shows its live on-chain durability here.
          </div>
        ) : (
          datasets
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((d) => (
              <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2.5">
                  <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-[#0d9488]" style={{ background: "#0d948822" }}>
                    {KIND_LABEL[d.kind]}
                  </span>
                  <span className="flex-1 truncate text-[13.5px] text-white/85">{d.title}</span>
                  {d.bytes != null && <span className="text-[11px] text-white/35">{fmtBytes(d.bytes)}</span>}
                  {d.objectId && (
                    <button
                      onClick={() => run("renew", () => neurus.renewDataset(active, d.id))}
                      disabled={!!busy}
                      className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/70 transition hover:border-white/30 disabled:opacity-40"
                    >
                      {busy === "renew" ? "…" : "Renew"}
                    </button>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {STRUCTURE.has(d.kind) ? (
                    <>
                      <span className="text-[11px] text-white/50">
                        {d.pages} {d.kind === "web" ? "page" : "file"}{d.pages === 1 ? "" : "s"} · {d.kind === "web" ? "from web" : d.kind === "github" ? "from GitHub" : "from folder"}
                      </span>
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-[#9aa8f0]/80 transition hover:text-[#aeb9f4]">
                          {d.kind === "github" ? d.title : hostOf(d.url)} ↗
                        </a>
                      )}
                    </>
                  ) : (
                    <>
                      <HealthBadge set={active} objectId={d.objectId} />
                      {d.blobId && (
                        <a
                          href={walruscan(d.blobId)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11px] text-[#9aa8f0]/80 transition hover:text-[#aeb9f4]"
                          title="view on Walruscan"
                        >
                          {d.blobId.slice(0, 14)}… ↗
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
        )}
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-white">Embed as a chatbot</h2>
            <p className="mt-0.5 text-[12px] text-white/40">
              Drop one script tag on any site — a grounded, cited assistant over <span className="font-mono text-white/60">{active}</span>.
            </p>
          </div>
          <button
            onClick={() => run("widget", () => neurus.createWidget(active, active, []))}
            disabled={!!busy}
            className="shrink-0 rounded-lg bg-[#9aa8f0] px-3.5 py-1.5 text-[12.5px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40"
          >
            {busy === "widget" ? "Creating…" : "Create widget"}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {widgets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[12.5px] text-white/40">
              No widget yet. Create one to get an embeddable chatbot for this set.
            </div>
          ) : (
            widgets.map((w) => (
              <div key={w.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-white/85">{w.name}</span>
                  <span className="font-mono text-[10px] text-white/30">{w.id}</span>
                  <a href={`/embed/${w.id}`} target="_blank" rel="noreferrer" className="ml-auto text-[11px] text-[#9aa8f0]/80 transition hover:text-[#aeb9f4]">
                    preview ↗
                  </a>
                  <button onClick={() => run("delwidget", () => neurus.deleteWidget(active, w.id))} disabled={!!busy} className="text-[11px] text-white/30 transition hover:text-red-400">
                    delete
                  </button>
                </div>
                <button
                  onClick={() => copy(snippet(w.id))}
                  className="mt-2 block w-full truncate rounded-lg border border-white/10 bg-[#0c0d10] px-3 py-2 text-left font-mono text-[11px] text-white/70 transition hover:border-white/25"
                  title="click to copy"
                >
                  {snippet(w.id)}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
