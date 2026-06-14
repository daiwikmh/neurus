"use client";

import { useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus } from "@/services/neurus";

export default function SetsPage() {
  const { sets, active, setActive, online, refresh } = useSets();
  const [name, setName] = useState("");
  const [blob, setBlob] = useState("");
  const [importId, setImportId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [snapshots, setSnapshots] = useState<Record<string, string[]>>({});
  const [sharing, setSharing] = useState<string | null>(null);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await neurus.createSet(n);
      setName("");
      refresh();
      setActive(n);
      setMsg(`created set "${n}"`);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };

  const index = async () => {
    const b = blob.trim();
    if (!b) return;
    setBusy(true);
    try {
      const r = await neurus.indexWalrus(active, b);
      setMsg(`indexed Walrus blob into "${active}" → ${r.source.title}`);
      setBlob("");
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };

  const share = async (setName: string) => {
    setSharing(setName);
    try {
      const r = await neurus.snapshotSet(setName);
      setSnapshots((prev) => ({ ...prev, [setName]: [r.blobId, ...(prev[setName] ?? [])] }));
      setMsg(`snapshot of "${setName}" → ${r.neurons} neurons · blob ID below`);
    } catch (e) {
      setMsg(`share failed: ${(e as Error).message}`);
    }
    setSharing(null);
  };

  const importSnapshot = async () => {
    const id = importId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const r = await neurus.importSnapshot(active, id);
      setMsg(`imported ${r.imported} neurons into "${active}"`);
      setImportId("");
    } catch (e) {
      setMsg(`import failed: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Knowledge sets</h1>
      <p className="mt-1 text-sm text-white/45">Each set is a namespace of neurons with its own visibility and integrity tier — owned on Walrus.</p>
      {!online && <p className="mt-2 text-[12px] text-amber-400/80">Can&apos;t reach your memory engine — check your connection.</p>}

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <div className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="New set name…" className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-white/30" />
          <button onClick={create} disabled={busy} className="rounded-lg bg-[#9aa8f0] px-3 py-1.5 text-[13px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-50">Create</button>
        </div>
        <div className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <input value={blob} onChange={(e) => setBlob(e.target.value)} onKeyDown={(e) => e.key === "Enter" && index()} placeholder={`Index a Walrus blob_id → ${active}`} className="flex-1 bg-transparent px-2 font-mono text-[12.5px] outline-none placeholder:text-white/30" />
          <button onClick={index} disabled={busy} className="rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-white/60 transition hover:text-white disabled:opacity-50">Index</button>
        </div>
      </div>

      <div className="mt-3 flex gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
        <input value={importId} onChange={(e) => setImportId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && importSnapshot()} placeholder={`Import snapshot blob ID → ${active}`} className="flex-1 bg-transparent px-2 font-mono text-[12.5px] outline-none placeholder:text-white/30" />
        <button onClick={importSnapshot} disabled={busy || !importId.trim()} className="rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-white/60 transition hover:text-white disabled:opacity-50">Import</button>
      </div>

      {msg && <div className="mt-3 font-mono text-[12px] text-white/45">{msg}</div>}

      <div className="mt-7 space-y-2.5">
        {(sets.length ? sets : []).map((s) => (
          <div key={s.id}>
            <div
              className={`flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition ${
                s.name === active ? "border-[#9aa8f0]/40 bg-[#9aa8f0]/[0.05]" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <button className="flex-1 text-left" onClick={() => setActive(s.name)}>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-medium text-white">{s.name}</span>
                  {s.name === active && <span className="rounded-full bg-[#9aa8f0]/15 px-2 py-0.5 text-[10px] font-medium text-[#9aa8f0]">active</span>}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-white/30">{s.id} · {s.namespace}</div>
              </button>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${s.visibility === "shared" ? "bg-blue-500/15 text-blue-300" : "bg-white/[0.06] text-white/45"}`}>
                {s.visibility}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${s.integrity === "verified" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.06] text-white/45"}`}>
                {s.integrity === "verified" ? "✓ verified" : "unverified"}
              </span>
              <button
                onClick={() => share(s.name)}
                disabled={sharing === s.name}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/50 transition hover:border-white/25 hover:text-white/80 disabled:opacity-40"
              >
                {sharing === s.name ? "…" : "Share"}
              </button>
            </div>
            {snapshots[s.name]?.length > 0 && (
              <div className="mt-1.5 space-y-1 pl-5">
                {snapshots[s.name].map((id, i) => (
                  <div key={id} className="flex items-center gap-2">
                    {i === 0 && <span className="text-[10px] text-white/30">latest</span>}
                    <button
                      onClick={() => copy(id)}
                      className="flex-1 truncate rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-left font-mono text-[11.5px] text-white/55 transition hover:border-white/20 hover:text-white/80"
                      title="click to copy"
                    >
                      {id}
                    </button>
                    <span className="shrink-0 text-[10px] text-white/25">copy</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {online && sets.length === 0 && <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35">No sets yet — create your first above.</div>}
      </div>
    </div>
  );
}
