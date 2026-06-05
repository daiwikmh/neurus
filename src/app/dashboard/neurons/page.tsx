"use client";

import { useEffect, useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus, type NeuronRow, type NeuronType } from "@/services/neurus";
import { neuronColor, trustColor, durabilityColor } from "../config";

const TYPES: (NeuronType | "all")[] = ["all", "person", "note", "file", "chunk", "insight", "commitment"];

function age(h: number) {
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function NeuronsPage() {
  const { active, online } = useSets();
  const [rows, setRows] = useState<NeuronRow[]>([]);
  const [filter, setFilter] = useState<NeuronType | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!online) { setLoading(false); return; }
    setLoading(true);
    neurus.neurons(active).then((r) => { setRows(r); setLoading(false); }).catch(() => { setRows([]); setLoading(false); });
  };
  useEffect(load, [active, online]);

  const forget = async (id: string) => {
    await neurus.forget(active, id).catch(() => {});
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const shown = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Neurons</h1>
          <p className="mt-1 text-sm text-white/45">Every memory written to <span className="font-mono text-white/70">{active}</span>, live on Walrus.</p>
        </div>
        <button onClick={load} className="rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-white/50 transition hover:text-white">Refresh</button>
      </div>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-full px-3 py-1 text-[12.5px] capitalize transition ${
              filter === t ? "bg-white/[0.09] text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {t}
            {t !== "all" && <span className="ml-1.5 text-white/25">{rows.filter((r) => r.type === t).length}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-white/40">loading neurons…</div>
        ) : !online ? (
          <div className="px-5 py-10 text-center text-sm text-white/40">Engine offline — run npm run api in neuron/.</div>
        ) : shown.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-white/40">No neurons yet. Capture one in Second Brain, or connect an agent.</div>
        ) : (
          shown.map((n) => (
            <div key={n.id} className="group flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0 hover:bg-white/[0.02]">
              <span className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase" style={{ background: `${neuronColor[n.type]}22`, color: neuronColor[n.type] }}>
                {n.type}
              </span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: trustColor[n.trust] }} title={`trust: ${n.trust}`} />
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: durabilityColor[n.durability] }} title={`durability: ${n.durability}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] text-white/85">{n.title}</div>
                <div className="truncate text-[12px] text-white/35">{n.preview}</div>
              </div>
              <span className="hidden shrink-0 font-mono text-[11px] text-white/30 sm:block">{n.synapses.length}🔗</span>
              <span className="hidden shrink-0 text-[11px] text-white/30 sm:block">{age(n.ageHours)}</span>
              <button
                onClick={() => forget(n.id)}
                className="shrink-0 rounded border border-white/10 px-2 py-0.5 text-[11px] text-white/30 opacity-0 transition hover:border-red-400/40 hover:text-red-400 group-hover:opacity-100"
              >
                forget
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
