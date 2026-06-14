"use client";

import { useEffect, useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus, type AgentDef, type SetInfo, type Dataset } from "@/services/neurus";
import { Section, Card, Labeled, fieldCls as field, btnPrimary, btnPrimarySm, btnDangerSm } from "../components/ui";

const ROLE_PRESETS = [
  "answers questions from the dataset",
  "summarizes and reports on the dataset",
  "extracts key facts and entities from the dataset",
  "tracks changes and flags what's notable in the dataset",
];

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

export default function AgentsPage() {
  const { active } = useSets();
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [sets, setSets] = useState<SetInfo[]>([]);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [dataset, setDataset] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [saving, setSaving] = useState(false);

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
  };

  const create = async () => {
    setSaving(true);
    try {
      await neurus.createAgent({
        name: name.trim() || "agent",
        role: role.trim(),
        dataset: dataset.trim(),
        datasetId: datasetId.trim(),
        feeds: [],
        assets: [],
        wallets: [],
        intervalMs: 5000,
        durationDays: 1,
        threshold: 0.5,
        telegram: false,
      });
      reset();
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-1 text-sm text-white/45">
          Give an agent a dataset to work on, then ask it anything grounded in that data. Live monitoring is set up per workflow in the Network tab.
        </p>
      </div>

      <Section label="Create an agent" />
      <Card title="New agent" sub="Name it, describe what it does, and choose the dataset it works on.">
        <div className="mt-4 grid gap-3">
          <div className="flex gap-3">
            <Labeled label="Name" className="flex-1">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Docs assistant" className={`mt-1 w-full ${field}`} />
            </Labeled>
            <Labeled label="What it does" className="flex-[2]">
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                list="role-presets"
                placeholder="pick one or type your own…"
                className={`mt-1 w-full ${field}`}
              />
              <datalist id="role-presets">
                {ROLE_PRESETS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
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

        <div className="mt-4">
          <button onClick={create} disabled={saving || !dataset.trim()} className={btnPrimary}>
            {saving ? "Saving…" : "Save agent"}
          </button>
        </div>
      </Card>

      <Section label="Your agents" />
      {agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-[13px] text-white/30">
          No agents yet — create one above.
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
              <div className="mt-3 text-[12px] text-white/50">
                <p><span className="text-white/35">works on</span> {a.dataset || <span className="text-amber-300/80">no dataset</span>}{a.datasetId ? " · one dataset" : ""}</p>
              </div>
              <AskBox dataset={a.dataset} datasetId={a.datasetId} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
