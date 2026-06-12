"use client";

import { useEffect, useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus, type AgentDef, type SetInfo, type Dataset } from "@/services/neurus";
import { Section, Card, Labeled, fieldCls as field, btnPrimary, btnPrimarySm, btnGhost, btnDangerSm } from "../components/ui";

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

type Template = { name: string; role: string; feeds: string[]; assets: string[]; wallets: string[] };

const READYMADE: Template[] = [
  { name: "Researcher", role: "reads the dataset and answers questions from it", feeds: [], assets: [], wallets: [] },
  { name: "Market watcher", role: "tracks asset prices and flags notable moves, grounded in the dataset", feeds: [], assets: ["sui", "ethereum"], wallets: [] },
  { name: "Protocol watcher", role: "tracks DeFi TVL changes and reports against the dataset", feeds: ["aave", "uniswap"], assets: [], wallets: [] },
];

function works(a: { assets: string[]; feeds: string[]; wallets: string[] }): string {
  const parts: string[] = [];
  if (a.assets.length) parts.push(`prices: ${a.assets.join(", ")}`);
  if (a.feeds.length) parts.push(`TVL: ${a.feeds.join(", ")}`);
  if (a.wallets.length) parts.push(`${a.wallets.length} wallet${a.wallets.length > 1 ? "s" : ""}`);
  return parts.length ? `live: ${parts.join(" · ")}` : "dataset only";
}

function DatasetPicker({ set, value, onChange }: { set: string; value: string; onChange: (id: string) => void }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  useEffect(() => {
    if (!set) {
      setDatasets([]);
      return;
    }
    neurus.datasets(set).then(setDatasets).catch(() => setDatasets([]));
  }, [set]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!set} className={`w-full ${field}`}>
      <option value="" className="bg-[#0c0d10]">whole set ({datasets.length} dataset{datasets.length === 1 ? "" : "s"})</option>
      {datasets.map((d) => (
        <option key={d.id} value={d.id} className="bg-[#0c0d10]">{d.title}</option>
      ))}
    </select>
  );
}

function AskBox({ dataset, datasetId }: { dataset: string; datasetId?: string }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState("");
  const [src, setSrc] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (!dataset || !q.trim()) return;
    setBusy(true);
    setAns("");
    setSrc([]);
    try {
      const r = await neurus.askAgent(dataset, datasetId || undefined, q.trim());
      setAns(r.answer);
      setSrc(r.sources);
    } catch (e) {
      setAns(`failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={dataset ? "Ask this agent…" : "pick a dataset first"}
          disabled={!dataset}
          className={`flex-1 ${field}`}
        />
        <button onClick={ask} disabled={busy || !dataset || !q.trim()} className={btnPrimarySm}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
      {ans && (
        <div className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[12.5px] leading-relaxed text-white/70">
          {ans}
          {src.length > 0 && <p className="mt-2 text-[11px] text-white/35">sources: {src.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

function ReadyMadeCard({ t, sets, fallback }: { t: Template; sets: SetInfo[]; fallback: string }) {
  const [ds, setDs] = useState(fallback);
  const [dsId, setDsId] = useState("");
  const [m, setM] = useState("");
  useEffect(() => {
    if (!ds && fallback) setDs(fallback);
  }, [fallback, ds]);

  const put = async () => {
    if (!ds) {
      setM("pick a dataset");
      return;
    }
    setM("deploying…");
    try {
      await neurus.startWorkflow(ds, {
        feeds: t.feeds,
        assets: t.assets,
        wallets: t.wallets,
        strategySet: ds,
        datasetId: dsId || undefined,
        instruction: t.role || undefined,
        durationDays: 5,
        intervalMs: 5000,
        threshold: 0.5,
        telegram: false,
      });
      setM(`working on "${ds}"${dsId ? " (one dataset)" : ""} — writing into its shared memory`);
    } catch (e) {
      setM(`failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Card className="self-start">
      <h3 className="text-[14px] font-medium text-white/85">{t.name}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-white/45">{t.role}</p>
      <p className="mt-2 text-[11.5px] text-white/35">{works(t)}</p>
      <select value={ds} onChange={(e) => { setDs(e.target.value); setDsId(""); }} className={`mt-3 w-full ${field}`}>
        <option value="" className="bg-[#0c0d10]">— set to work on —</option>
        {sets.map((s) => (
          <option key={s.id} value={s.name} className="bg-[#0c0d10]">{s.name}</option>
        ))}
      </select>
      <div className="mt-2">
        <DatasetPicker set={ds} value={dsId} onChange={setDsId} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={put} className={btnPrimarySm}>Put to work</button>
        {ds && (
          <button onClick={() => neurus.stopWorkflow(ds).then(() => setM(`stopped on "${ds}"`)).catch(() => {})} className={btnGhost}>Stop</button>
        )}
      </div>
      {m && <p className="mt-2 text-[11.5px] text-white/45">{m}</p>}
      <AskBox dataset={ds} datasetId={dsId} />
    </Card>
  );
}

export default function AgentsPage() {
  const { active } = useSets();
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [sets, setSets] = useState<SetInfo[]>([]);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [dataset, setDataset] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [feeds, setFeeds] = useState("");
  const [assets, setAssets] = useState("");
  const [wallets, setWallets] = useState("");
  const [everyS, setEveryS] = useState("5");
  const [days, setDays] = useState("5");
  const [threshold, setThreshold] = useState("0.5");
  const [telegram, setTelegram] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = () => neurus.agents().then(setAgents).catch(() => setAgents([]));
  useEffect(() => {
    load();
    neurus.sets().then(setSets).catch(() => setSets([]));
  }, []);
  useEffect(() => {
    if (!dataset && active) setDataset(active);
  }, [active, dataset]);

  const reset = () => {
    setName("");
    setRole("");
    setDatasetId("");
    setFeeds("");
    setAssets("");
    setWallets("");
    setTelegram(false);
  };

  const create = async () => {
    setSaving(true);
    try {
      await neurus.createAgent({
        name: name.trim() || "agent",
        role: role.trim(),
        dataset: dataset.trim(),
        datasetId: datasetId.trim(),
        feeds: split(feeds),
        assets: split(assets),
        wallets: split(wallets),
        intervalMs: (Number(everyS) || 5) * 1000,
        durationDays: Number(days) || 1,
        threshold: Number(threshold) || 0.5,
        telegram,
      });
      reset();
      load();
    } finally {
      setSaving(false);
    }
  };

  const deploy = async (a: AgentDef) => {
    if (!a.dataset) {
      setMsg((m) => ({ ...m, [a.id]: "this agent has no dataset — edit it and pick one" }));
      return;
    }
    setMsg((m) => ({ ...m, [a.id]: "deploying…" }));
    try {
      await neurus.startWorkflow(a.dataset, {
        feeds: a.feeds,
        assets: a.assets,
        wallets: a.wallets,
        strategySet: a.dataset,
        datasetId: a.datasetId || undefined,
        instruction: a.role || undefined,
        durationDays: a.durationDays,
        intervalMs: a.intervalMs,
        threshold: a.threshold,
        telegram: a.telegram,
      });
      setMsg((m) => ({ ...m, [a.id]: `working on "${a.dataset}"${a.datasetId ? " (one dataset)" : ""} — writing into its shared memory` }));
    } catch (e) {
      setMsg((m) => ({ ...m, [a.id]: `failed: ${e instanceof Error ? e.message : String(e)}` }));
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-1 text-sm text-white/45">
          Give an agent a dataset to work on. Start from a ready-made one or build your own, then put it to work.
        </p>
      </div>

      <Section label="Create an agent" />
      <Card title="New agent" sub="Name it, describe what it does, and choose the dataset it works on. Live monitoring is optional.">
        <div className="mt-4 grid gap-3">
          <div className="flex gap-3">
            <Labeled label="Name" className="flex-1">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Docs assistant" className={`mt-1 w-full ${field}`} />
            </Labeled>
            <Labeled label="What it does" className="flex-[2]">
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="answers questions from the dataset" className={`mt-1 w-full ${field}`} />
            </Labeled>
          </div>
          <div className="flex gap-3">
            <Labeled label="Works on (set)" className="flex-1">
              <select value={dataset} onChange={(e) => { setDataset(e.target.value); setDatasetId(""); }} className={`mt-1 w-full ${field}`}>
                <option value="" className="bg-[#0c0d10]">— pick a set —</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.name} className="bg-[#0c0d10]">{s.name}</option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Narrow to one dataset (optional)" className="flex-1">
              <div className="mt-1">
                <DatasetPicker set={dataset} value={datasetId} onChange={setDatasetId} />
              </div>
            </Labeled>
          </div>
        </div>

        <details className="group mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[12.5px] text-white/55 marker:content-none [&::-webkit-details-marker]:hidden">
            Advanced: live monitoring (optional)
            <svg viewBox="0 0 12 12" className="h-3 w-3 text-white/30 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="flex gap-3">
              <Labeled label="Assets (price)" className="flex-1">
                <input value={assets} onChange={(e) => setAssets(e.target.value)} placeholder="sui,ethereum" className={`mt-1 w-full ${field}`} />
              </Labeled>
              <Labeled label="Protocols (TVL)" className="flex-1">
                <input value={feeds} onChange={(e) => setFeeds(e.target.value)} placeholder="aave,uniswap" className={`mt-1 w-full ${field}`} />
              </Labeled>
            </div>
            <Labeled label="Wallets (Sui address, watch-only)">
              <input value={wallets} onChange={(e) => setWallets(e.target.value)} placeholder="0x…" className={`mt-1 w-full ${field}`} />
            </Labeled>
            <div className="flex items-end gap-3">
              <Labeled label="Every (s)">
                <input value={everyS} onChange={(e) => setEveryS(e.target.value)} className={`mt-1 w-20 ${field}`} />
              </Labeled>
              <Labeled label="For (days)">
                <input value={days} onChange={(e) => setDays(e.target.value)} className={`mt-1 w-20 ${field}`} />
              </Labeled>
              <Labeled label="Anomaly >= (%)">
                <input value={threshold} onChange={(e) => setThreshold(e.target.value)} className={`mt-1 w-24 ${field}`} />
              </Labeled>
              <label className="flex items-center gap-2 pb-1.5 text-[12.5px] text-white/65">
                <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} className="accent-[#9aa8f0]" />
                Telegram
              </label>
            </div>
          </div>
        </details>

        <div className="mt-4">
          <button onClick={create} disabled={saving || !dataset.trim()} className={btnPrimary}>
            {saving ? "Saving…" : "Save agent"}
          </button>
        </div>
      </Card>

      <Section label="Ready-made agents" />
      <div className="grid gap-3 lg:grid-cols-3">
        {READYMADE.map((t) => (
          <ReadyMadeCard key={t.name} t={t} sets={sets} fallback={active} />
        ))}
      </div>

      <Section label="Your agents" />
      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-[13px] text-white/30">
          No agents yet — build one above or start from a ready-made one.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {agents.map((a) => (
            <Card key={a.id} className="self-start">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-medium text-white/85">{a.name}</h3>
                  {a.role && <p className="mt-0.5 text-[12px] text-white/45">{a.role}</p>}
                </div>
                <button onClick={() => neurus.deleteAgent(a.id).then(load)} className={btnDangerSm}>delete</button>
              </div>
              <div className="mt-3 space-y-1 text-[12px] text-white/50">
                <p><span className="text-white/35">works on</span> {a.dataset || <span className="text-amber-300/80">no dataset</span>}{a.datasetId ? " · one dataset" : ""}</p>
                <p><span className="text-white/35">mode</span> {works(a)}</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => deploy(a)} className={btnPrimarySm}>Put to work</button>
                {a.dataset && (
                  <button onClick={() => neurus.stopWorkflow(a.dataset).then(() => setMsg((m) => ({ ...m, [a.id]: `stopped on "${a.dataset}"` }))).catch(() => {})} className={btnGhost}>Stop</button>
                )}
              </div>
              {msg[a.id] && <p className="mt-2 text-[11.5px] text-white/45">{msg[a.id]}</p>}
              <AskBox dataset={a.dataset} datasetId={a.datasetId} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
