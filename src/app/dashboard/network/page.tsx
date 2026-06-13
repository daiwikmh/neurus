"use client";

import { useEffect, useState } from "react";
import { useSets } from "../components/SetContext";
import { useSettings } from "../components/SettingsContext";
import { neurus, netStream, type NetNeuron, type RosterEntry, type NeuronRow, type Durability, type NetAnswer, type PlayRow } from "@/services/neurus";
import { NeuronGraph } from "../components/NeuronGraph";
import { NetworkCanvas } from "../components/NetworkCanvas";
import { MemoryFeed } from "../components/MemoryFeed";
import { Section, Card, Labeled, Dot, fieldCls as field, btnPrimary, btnPrimarySm, btnGhost, btnDanger, panelCls, microLabel } from "../components/ui";
import { merkleRoot } from "./merkle";

const AGENT_COLORS = ["#9aa8f0", "#34d399", "#f59e0b", "#f472b6", "#22d3ee", "#a78bfa", "#fb7185", "#4ade80"];

interface FeedItem {
  actor: string;
  type: string;
  lamport: number;
  title?: string;
  ok: boolean;
  reason?: string;
}

export default function NetworkPage() {
  const { active, online } = useSets();
  const { askModel } = useSettings();
  const [neurons, setNeurons] = useState<NetNeuron[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [root, setRoot] = useState("");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [clientRoot, setClientRoot] = useState("");
  const [gActor, setGActor] = useState("");
  const [gSecret, setGSecret] = useState("");
  const [gRole, setGRole] = useState<"read" | "write">("write");
  const [seedMsg, setSeedMsg] = useState("");
  const [imported, setImported] = useState(false);
  const [wfFeeds, setWfFeeds] = useState("aave,uniswap,lido");
  const [wfAssets, setWfAssets] = useState("");
  const [wfWallets, setWfWallets] = useState("");
  const [wfDeepbook, setWfDeepbook] = useState(false);
  const [wfStrategy, setWfStrategy] = useState("");
  const [wfInstruction, setWfInstruction] = useState("");
  const [wfDuration, setWfDuration] = useState("5");
  const [wfInterval, setWfInterval] = useState("5");
  const [wfThreshold, setWfThreshold] = useState("0.5");
  const [wfRunning, setWfRunning] = useState(false);
  const [wfPrompt, setWfPrompt] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [compileMsg, setCompileMsg] = useState("");
  const [grantMsg, setGrantMsg] = useState("");
  const [view, setView] = useState<"canvas" | "graph">("canvas");
  const [wfReportMsg, setWfReportMsg] = useState("");
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState<NetAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [pAsset, setPAsset] = useState("");
  const [pDir, setPDir] = useState<"long" | "short">("long");
  const [pEntry, setPEntry] = useState("");
  const [pTarget, setPTarget] = useState("");
  const [pStop, setPStop] = useState("");
  const [pThesis, setPThesis] = useState("");
  const [playMsg, setPlayMsg] = useState("");

  const loadPlays = () => neurus.listPlays(active).then(setPlays).catch(() => {});

  useEffect(() => {
    let closed = false;
    setNeurons([]);
    setRoster([]);
    setFeed([]);
    setRoot("");
    setImported(false);
    neurus
      .netState(active)
      .then((s) => {
        if (closed) return;
        setNeurons(s.neurons);
        setRoster(s.roster);
        setRoot(s.root);
      })
      .catch(() => {});
    const stop = netStream(active, ({ event, data }) => {
      if (event === "state") {
        setNeurons(data.neurons);
        setRoster(data.roster);
        setRoot(data.root);
      } else if (event === "roster") {
        setRoster(data.roster);
      } else if (event === "op") {
        const o = data.op;
        setFeed((f) => [{ actor: o.actor, type: o.type, lamport: o.lamport, title: o.title, ok: data.ok, reason: data.reason }, ...f].slice(0, 80));
      }
    });
    return () => {
      closed = true;
      stop();
    };
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    merkleRoot(neurons).then((r) => {
      if (!cancelled) setClientRoot(r);
    });
    return () => {
      cancelled = true;
    };
  }, [neurons]);

  useEffect(() => {
    loadPlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    neurus
      .workflowStatus(active)
      .then((s) => {
        setWfRunning(s.running);
        if (s.running) {
          if (s.feeds.length) setWfFeeds(s.feeds.join(","));
          if (s.assets?.length) setWfAssets(s.assets.join(","));
          if (s.wallets?.length) setWfWallets(s.wallets.join(","));
          setWfDeepbook(!!s.deepbook);
          if (s.strategySet) setWfStrategy(s.strategySet);
          if (s.instruction) setWfInstruction(s.instruction);
          if (s.durationDays) setWfDuration(String(s.durationDays));
        }
      })
      .catch(() => {});
  }, [active]);

  const authors = [...new Set(neurons.map((n) => n.source.author))];
  const colorFor = (a: string) => AGENT_COLORS[(authors.indexOf(a) + AGENT_COLORS.length) % AGENT_COLORS.length];
  const idColor = new Map(neurons.map((n) => [n.id, colorFor(n.source.author)]));

  const chunkCount = new Map<string, number>();
  for (const n of neurons) {
    if (n.type !== "chunk") continue;
    const parent = n.synapses.find((s) => s.kind === "derived_from")?.to;
    if (parent) chunkCount.set(parent, (chunkCount.get(parent) ?? 0) + 1);
  }
  const displayNeurons = neurons.filter((n) => n.type !== "chunk");

  const rows: NeuronRow[] = displayNeurons.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.type === "file" && chunkCount.get(n.id) ? `${n.title} · ${chunkCount.get(n.id)} chunks` : n.title,
    trust: n.source.trust,
    author: n.source.author,
    durability: (n.meta?.durability as Durability) ?? "confirmed",
    importance: n.meta?.importance as number | undefined,
    ageHours: Math.round((Date.now() - n.createdAt) / 3_600_000),
    synapses: n.synapses.filter((s) => s.kind !== "derived_from"),
    preview: n.body.slice(0, 140),
  }));
  const legend = authors.map((a) => ({ label: a, color: colorFor(a) }));

  const importMemory = () => {
    setSeedMsg("importing…");
    neurus
      .seedNet(active)
      .then((s) => {
        setNeurons(s.neurons);
        setRoster(s.roster);
        setRoot(s.root);
        setImported(true);
        setSeedMsg(s.added > 0 ? `imported ${s.added}` : "already imported");
      })
      .catch((e) => setSeedMsg(`failed: ${(e as Error)?.message ?? "request error"}`));
  };

  const compile = () => {
    if (!wfPrompt.trim()) return;
    setCompiling(true);
    setCompileMsg("building…");
    neurus
      .compileWorkflow(active, wfPrompt)
      .then((spec) => {
        setWfFeeds(spec.protocols.join(","));
        setWfAssets(spec.assets.join(","));
        setWfWallets(spec.wallets.join(","));
        setWfDeepbook(spec.deepbook);
        setWfStrategy(spec.strategySet ?? "");
        setWfInstruction(spec.instruction);
        setWfDuration(String(spec.durationDays));
        setWfInterval(String(Math.round(spec.intervalMs / 1000)));
        setCompileMsg(`built — ${spec.assets.length} asset(s), ${spec.protocols.length} protocol(s), ${spec.wallets.length} wallet(s)${spec.strategySet ? `, grounded in “${spec.strategySet}”` : ""}. Review and run.`);
      })
      .catch((e) => setCompileMsg(`failed: ${(e as Error)?.message ?? "error"}`))
      .finally(() => setCompiling(false));
  };

  const wfPayload = () => ({
    protocols: wfFeeds.split(",").map((f) => f.trim()).filter(Boolean),
    assets: wfAssets.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
    wallets: wfWallets.split(",").map((w) => w.trim()).filter(Boolean),
    deepbook: wfDeepbook,
    strategySet: wfStrategy.trim() || undefined,
    instruction: wfInstruction.trim() || undefined,
    durationDays: Number(wfDuration) || undefined,
    intervalMs: Math.round(Number(wfInterval) * 1000) || 5000,
    threshold: Number(wfThreshold) || 0.5,
  });

  const runWorkflow = () => {
    neurus
      .startWorkflow(active, wfPayload())
      .then((s) => setWfRunning(s.running))
      .catch(() => {});
  };

  const stopWorkflow = () => {
    neurus
      .stopWorkflow(active)
      .then((s) => setWfRunning(s.running))
      .catch(() => {});
  };

  const sendReport = () => {
    setWfReportMsg("sending…");
    neurus
      .reportNow(active)
      .then((r) => setWfReportMsg(r.sent ? "report sent to Telegram ✓" : r.error ?? "no Telegram configured / not running"))
      .catch(() => setWfReportMsg("failed"));
  };

  const sendBrief = () => {
    setWfReportMsg("composing brief…");
    neurus
      .briefNow(active)
      .then((r) => setWfReportMsg(r.brief ? (r.sent ? "daily brief sent to Telegram ✓" : "brief written (no Telegram)") : r.error ?? "nothing to brief yet"))
      .catch(() => setWfReportMsg("failed"));
  };

  const runFlow = (cfg: { feeds: string[]; telegram: boolean }) => {
    neurus
      .startWorkflow(active, { ...wfPayload(), protocols: cfg.feeds, telegram: cfg.telegram })
      .then((s) => setWfRunning(s.running))
      .catch(() => {});
  };

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const q = askQ.trim();
    if (!q || asking) return;
    setAsking(true);
    setAskA(null);
    neurus
      .netAsk(active, q, askModel)
      .then(setAskA)
      .catch((err) => setAskA({ text: `failed: ${(err as Error)?.message ?? "request error"}`, sources: [], spans: [] }))
      .finally(() => setAsking(false));
  };

  const logPlay = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = Number(pEntry);
    if (!pAsset.trim() || !Number.isFinite(entry) || entry <= 0) {
      setPlayMsg("asset and a positive entry price are required");
      return;
    }
    setPlayMsg("logging…");
    neurus
      .logPlay(active, {
        asset: pAsset.trim().toLowerCase(),
        direction: pDir,
        entry,
        target: Number(pTarget) > 0 ? Number(pTarget) : undefined,
        stop: Number(pStop) > 0 ? Number(pStop) : undefined,
        thesis: pThesis.trim() || undefined,
      })
      .then(() => {
        setPAsset("");
        setPEntry("");
        setPTarget("");
        setPStop("");
        setPThesis("");
        setPlayMsg("logged");
        loadPlays();
      })
      .catch((err) => setPlayMsg(`failed: ${(err as Error)?.message ?? "error"}`));
  };

  const closePlay = (id: string) => {
    setPlayMsg("closing…");
    neurus
      .closePlay(active, id)
      .then(() => {
        setPlayMsg("closed — post-mortem written");
        loadPlays();
      })
      .catch((err) => setPlayMsg(`failed: ${(err as Error)?.message ?? "error"}`));
  };

  const grant = (e: React.FormEvent) => {
    e.preventDefault();
    const actor = gActor.trim();
    if (!actor) {
      setGrantMsg("enter an agent name");
      return;
    }
    const secret = gSecret.trim() || crypto.randomUUID().slice(0, 12);
    neurus
      .netGrant(active, actor, secret, gRole)
      .then((s) => {
        setRoster(s.roster);
        setGActor("");
        setGSecret("");
        setGrantMsg(`granted ${actor} (${gRole})${gSecret.trim() ? "" : ` · secret: ${secret}`}`);
      })
      .catch((err) => setGrantMsg(`failed: ${(err as Error)?.message ?? "error"}`));
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Network</h1>
          <p className="mt-1 text-sm text-white/45">
            Agents collaborating in <span className="font-mono text-white/70">{active}</span> — shared memory on Walrus, every write signed and attributed.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-[12px]">
          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-500"}`} />
          <span className="text-white/45">root</span>
          <span className="font-mono text-white/70">{root ? root.slice(0, 12) : "—"}</span>
          {root &&
            (clientRoot === root ? (
              <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300" title="dashboard recomputed the merkle root from the neurons it received — it matches the server">
                verified
              </span>
            ) : (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">syncing</span>
            ))}
        </div>
      </div>

      <Section label="Build" />
      <div className="rounded-2xl border border-[#9aa8f0]/25 bg-[#9aa8f0]/[0.04] p-5">
        <h2 className="text-sm font-medium text-white/85">Describe a workflow</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/45">
          Say what you want in plain English — Neurus compiles it into agents on the canvas, grounded in your knowledge sets, wallets, and live data.
        </p>
        <textarea
          value={wfPrompt}
          onChange={(e) => setWfPrompt(e.target.value)}
          rows={2}
          placeholder="For the next 5 days, send me Telegram updates on SUI based on the strategy in my trading-rules set — check every minute"
          className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-[#0c0d12] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#9aa8f0]/50"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={compile} disabled={compiling || !wfPrompt.trim()} className={btnPrimary}>
            {compiling ? "Building…" : "Build workflow"}
          </button>
          {compileMsg && <span className="text-[12px] text-white/55">{compileMsg}</span>}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Card collapsible title="Workflow" sub="Agents track DefiLlama protocols, asset prices, and wallets over time; the analyst reports — grounded in your strategy set — to Telegram.">
          <div className="mt-4 space-y-3">
            <div className="flex gap-3">
              <Labeled label="Protocols (TVL)" className="flex-1">
                <input value={wfFeeds} onChange={(e) => setWfFeeds(e.target.value)} disabled={wfRunning} placeholder="aave,uniswap" className={`mt-1 w-full ${field}`} />
              </Labeled>
              <Labeled label="Assets (price)" className="flex-1">
                <input value={wfAssets} onChange={(e) => setWfAssets(e.target.value)} disabled={wfRunning} placeholder="sui,ethereum" className={`mt-1 w-full ${field}`} />
              </Labeled>
            </div>
            <Labeled label="Wallets (Sui address, watch-only)">
              <input value={wfWallets} onChange={(e) => setWfWallets(e.target.value)} disabled={wfRunning} placeholder="0x…" className={`mt-1 w-full ${field}`} />
            </Labeled>
            <label className="flex items-center gap-2 text-[12.5px] text-white/65">
              <input type="checkbox" checked={wfDeepbook} onChange={(e) => setWfDeepbook(e.target.checked)} disabled={wfRunning} className="accent-[#9aa8f0]" />
              Read & grade my DeepBook trades (for owned balance managers on the watched wallets)
            </label>
            <Labeled label="Strategy set (grounding)">
              <input value={wfStrategy} onChange={(e) => setWfStrategy(e.target.value)} disabled={wfRunning} placeholder="trading-rules" className={`mt-1 w-full ${field}`} />
            </Labeled>
            <div className="flex items-end gap-3">
              <Labeled label="Every (s)">
                <input value={wfInterval} onChange={(e) => setWfInterval(e.target.value)} disabled={wfRunning} className={`mt-1 w-20 ${field}`} />
              </Labeled>
              <Labeled label="For (days)">
                <input value={wfDuration} onChange={(e) => setWfDuration(e.target.value)} disabled={wfRunning} className={`mt-1 w-20 ${field}`} />
              </Labeled>
              <Labeled label="Anomaly >= (%)">
                <input value={wfThreshold} onChange={(e) => setWfThreshold(e.target.value)} disabled={wfRunning} className={`mt-1 w-20 ${field}`} />
              </Labeled>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {wfRunning ? (
              <>
                <button onClick={stopWorkflow} className={btnDanger}>Stop</button>
                <button onClick={sendReport} className={btnGhost}>Send report now</button>
                <button onClick={sendBrief} className={btnGhost}>Send brief now</button>
              </>
            ) : (
              <button onClick={runWorkflow} className={btnPrimary}>Run workflow</button>
            )}
            <span className={`inline-flex items-center gap-1.5 text-[12px] ${wfRunning ? "text-emerald-300" : "text-white/35"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${wfRunning ? "bg-emerald-400" : "bg-white/20"}`} />
              {wfRunning ? "running — feed-agents writing to the network" : "idle"}
            </span>
            {wfReportMsg && <span className="text-[12px] text-white/45">{wfReportMsg}</span>}
          </div>
        </Card>

        <Card collapsible defaultOpen={false} title="Agents" sub="Who can write to this set's shared memory. Revoke any agent and its next write bounces.">
          <div className="mt-3 space-y-1.5">
            {roster.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12.5px] text-white/30">No agents yet — run a workflow or grant one below.</div>
            ) : (
              roster.map((r) => (
                <div key={r.actor} className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.015] px-3 py-1.5 text-[12.5px]">
                  <Dot color={colorFor(r.actor)} />
                  <span className="flex-1 text-white/80">{r.actor}</span>
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase text-white/40">{r.can}</span>
                  <button onClick={() => neurus.netRevoke(active, r.actor).then((s) => setRoster(s.roster)).catch(() => {})} className="text-white/25 transition hover:text-red-400">
                    revoke
                  </button>
                </div>
              ))
            )}
          </div>
          <form onSubmit={grant} className="mt-3 flex items-center gap-1.5">
            <input value={gActor} onChange={(e) => setGActor(e.target.value)} placeholder="agent name" className={`flex-1 ${field}`} />
            <input value={gSecret} onChange={(e) => setGSecret(e.target.value)} placeholder="secret (optional)" className={`w-28 ${field}`} />
            <select value={gRole} onChange={(e) => setGRole(e.target.value as "read" | "write")} className={field}>
              <option value="write" className="bg-[#0c0d10]">write</option>
              <option value="read" className="bg-[#0c0d10]">read</option>
            </select>
            <button type="submit" className={btnPrimarySm}>grant</button>
          </form>
          {grantMsg && <p className="mt-2 text-[12px] text-white/45">{grantMsg}</p>}
        </Card>

        <MemoryFeed set={active} collapsible defaultOpen={false} />

        <Card collapsible defaultOpen={false} title="Plays" sub="Log your positions — the analyst grades each one against your strategy every report cycle and writes a post-mortem when you close.">
          <div className="mt-3 space-y-1.5">
            {plays.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12.5px] text-white/30">No plays yet — log one below.</div>
            ) : (
              plays.map((p) => (
                <div key={p.id} className={`flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.015] px-3 py-1.5 text-[12.5px] ${p.status === "closed" ? "opacity-50" : ""}`}>
                  <span className="font-medium text-white/80">{p.asset.toUpperCase()}</span>
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase text-white/40">{p.direction}</span>
                  <span className="text-white/45">@ {p.entry}</span>
                  {p.stop != null && <span className="text-white/30">stop {p.stop}</span>}
                  {p.target != null && <span className="text-white/30">target {p.target}</span>}
                  <span className="min-w-0 flex-1 truncate text-white/35">{p.thesis}</span>
                  {p.plPct != null && (
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${p.plPct >= 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
                      {p.plPct >= 0 ? "+" : ""}
                      {p.plPct}%
                    </span>
                  )}
                  {p.status === "open" ? (
                    <button onClick={() => closePlay(p.id)} className="text-white/25 transition hover:text-red-400">close</button>
                  ) : (
                    <span className="font-mono text-[10px] uppercase text-white/30">closed</span>
                  )}
                </div>
              ))
            )}
          </div>
          <form onSubmit={logPlay} className="mt-3 flex flex-wrap items-center gap-1.5">
            <input value={pAsset} onChange={(e) => setPAsset(e.target.value)} placeholder="asset (sui)" className={`w-28 ${field}`} />
            <select value={pDir} onChange={(e) => setPDir(e.target.value as "long" | "short")} className={field}>
              <option value="long" className="bg-[#0c0d10]">long</option>
              <option value="short" className="bg-[#0c0d10]">short</option>
            </select>
            <input value={pEntry} onChange={(e) => setPEntry(e.target.value)} placeholder="entry" className={`w-24 ${field}`} />
            <input value={pTarget} onChange={(e) => setPTarget(e.target.value)} placeholder="target" className={`w-24 ${field}`} />
            <input value={pStop} onChange={(e) => setPStop(e.target.value)} placeholder="stop" className={`w-24 ${field}`} />
            <input value={pThesis} onChange={(e) => setPThesis(e.target.value)} placeholder="thesis (optional)" className={`min-w-40 flex-1 ${field}`} />
            <button type="submit" className={btnPrimarySm}>log play</button>
          </form>
          {playMsg && <p className="mt-2 text-[12px] text-white/45">{playMsg}</p>}
        </Card>
      </div>

      <Section label="Memory & activity" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-medium text-white/80">{view === "canvas" ? "Workflow canvas" : "Shared memory"}</h2>
            <div className="flex rounded-lg border border-white/10 p-0.5">
              {(["canvas", "graph"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 text-[12px] capitalize transition ${view === v ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={importMemory} className="rounded-md border border-[#9aa8f0]/30 bg-[#9aa8f0]/10 px-2.5 py-1 text-[12px] text-[#aeb9f4] transition hover:bg-[#9aa8f0]/20">
              {imported ? "Re-import set memory" : "Import set memory"}
            </button>
            {seedMsg && <span className="text-[12px] text-white/45">{seedMsg}</span>}
          </div>
          {view === "canvas" ? (
            <NetworkCanvas
              setKey={active}
              datasets={rows.filter((r) => r.type === "file").map((r) => ({ id: r.id, label: r.title }))}
              feeds={wfFeeds.split(",").map((f) => f.trim()).filter(Boolean)}
              assets={wfAssets.split(",").map((a) => a.trim()).filter(Boolean)}
              wallets={wfWallets.split(",").map((w) => w.trim()).filter(Boolean)}
              deepbook={wfDeepbook}
              strategy={wfStrategy.trim() || undefined}
              running={wfRunning}
              onRun={runFlow}
              onStop={stopWorkflow}
            />
          ) : (
            <NeuronGraph neurons={rows} colorOf={(id) => idColor.get(id) ?? "#64748b"} legend={legend} />
          )}
        </div>

        <div className="flex max-h-[560px] flex-col gap-4">
          <div className={`${panelCls} p-4`}>
            <div className={microLabel}>Ask the network</div>
            <form onSubmit={ask} className="mt-2.5 flex items-center gap-1.5">
              <input value={askQ} onChange={(e) => setAskQ(e.target.value)} placeholder="what changed today?" className={`flex-1 ${field}`} />
              <button type="submit" disabled={asking} className={btnPrimarySm}>
                {asking ? "…" : "ask"}
              </button>
            </form>
            {askA && (
              <div className="mt-3 space-y-2">
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/80">{askA.text}</p>
                {askA.spans.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {askA.spans.slice(0, 4).map((s) => (
                      <span key={s.id} title={s.preview} className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] text-white/45">
                        <Dot color={colorFor(s.author)} className="h-1.5 w-1.5" />
                        {s.author} · {s.ageHours}h
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${panelCls}`}>
          <div className={`border-b border-white/10 px-4 py-2.5 ${microLabel}`}>Live op feed</div>
          <div className="flex-1 overflow-y-auto">
            {feed.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-white/30">No activity yet. Run a workflow or grant an agent.</div>
            ) : (
              feed.map((f, i) => (
                <div key={i} className={`flex items-center gap-2 border-b border-white/[0.05] px-3 py-2 text-[12px] ${f.ok ? "" : "bg-red-500/5"}`}>
                  <Dot color={f.ok ? colorFor(f.actor) : "#ef4444"} />
                  <span className="shrink-0 font-medium text-white/80">{f.actor}</span>
                  <span className={`shrink-0 font-mono text-[10px] uppercase ${f.ok ? "text-white/40" : "text-red-400"}`}>{f.ok ? f.type : "rejected"}</span>
                  <span className="min-w-0 flex-1 truncate text-white/45">{f.title ?? f.reason ?? ""}</span>
                  <span className="shrink-0 font-mono text-[10px] text-white/25">L{f.lamport}</span>
                </div>
              ))
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
