"use client";

import { useEffect, useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus, netStream, type NetNeuron, type RosterEntry, type NeuronRow, type Durability } from "@/services/neurus";
import { NeuronGraph } from "../components/NeuronGraph";
import { NetworkCanvas } from "../components/NetworkCanvas";
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

function Section({ label }: { label: string }) {
  return <div className="mb-2 mt-7 text-[11px] uppercase tracking-[0.16em] text-white/30">{label}</div>;
}

export default function NetworkPage() {
  const { active, online } = useSets();
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
    neurus
      .workflowStatus(active)
      .then((s) => {
        setWfRunning(s.running);
        if (s.running) {
          if (s.feeds.length) setWfFeeds(s.feeds.join(","));
          if (s.assets?.length) setWfAssets(s.assets.join(","));
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
        setWfStrategy(spec.strategySet ?? "");
        setWfInstruction(spec.instruction);
        setWfDuration(String(spec.durationDays));
        setWfInterval(String(Math.round(spec.intervalMs / 1000)));
        setCompileMsg(`built — ${spec.assets.length} asset(s), ${spec.protocols.length} protocol(s)${spec.strategySet ? `, grounded in “${spec.strategySet}”` : ""}. Review and run.`);
      })
      .catch((e) => setCompileMsg(`failed: ${(e as Error)?.message ?? "error"}`))
      .finally(() => setCompiling(false));
  };

  const wfPayload = () => ({
    protocols: wfFeeds.split(",").map((f) => f.trim()).filter(Boolean),
    assets: wfAssets.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
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

  const runFlow = (cfg: { feeds: string[]; telegram: boolean }) => {
    neurus
      .startWorkflow(active, { ...wfPayload(), protocols: cfg.feeds, telegram: cfg.telegram })
      .then((s) => setWfRunning(s.running))
      .catch(() => {});
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

  const field = "rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#9aa8f0]/50 disabled:opacity-50";

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
          Say what you want in plain English — Neurus compiles it into agents on the canvas, grounded in your knowledge sets and live data.
        </p>
        <textarea
          value={wfPrompt}
          onChange={(e) => setWfPrompt(e.target.value)}
          rows={2}
          placeholder="For the next 5 days, send me Telegram updates on SUI based on the strategy in my trading-rules set — check every minute"
          className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-[#0c0d12] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#9aa8f0]/50"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={compile}
            disabled={compiling || !wfPrompt.trim()}
            className="rounded-lg bg-[#9aa8f0] px-4 py-2 text-[13px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40"
          >
            {compiling ? "Building…" : "Build workflow"}
          </button>
          {compileMsg && <span className="text-[12px] text-white/55">{compileMsg}</span>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="text-sm font-medium text-white/80">Workflow</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/40">Agents track DefiLlama protocols + asset prices over time; the analyst reports — grounded in your strategy set — to Telegram.</p>
          <div className="mt-4 space-y-3">
            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="text-[11px] uppercase tracking-wide text-white/35">Protocols (TVL)</span>
                <input value={wfFeeds} onChange={(e) => setWfFeeds(e.target.value)} disabled={wfRunning} placeholder="aave,uniswap" className={`mt-1 w-full ${field}`} />
              </label>
              <label className="block flex-1">
                <span className="text-[11px] uppercase tracking-wide text-white/35">Assets (price)</span>
                <input value={wfAssets} onChange={(e) => setWfAssets(e.target.value)} disabled={wfRunning} placeholder="sui,ethereum" className={`mt-1 w-full ${field}`} />
              </label>
            </div>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-white/35">Strategy set (grounding)</span>
              <input value={wfStrategy} onChange={(e) => setWfStrategy(e.target.value)} disabled={wfRunning} placeholder="trading-rules" className={`mt-1 w-full ${field}`} />
            </label>
            <div className="flex items-end gap-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-white/35">Every (s)</span>
                <input value={wfInterval} onChange={(e) => setWfInterval(e.target.value)} disabled={wfRunning} className={`mt-1 w-20 ${field}`} />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-white/35">For (days)</span>
                <input value={wfDuration} onChange={(e) => setWfDuration(e.target.value)} disabled={wfRunning} className={`mt-1 w-20 ${field}`} />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wide text-white/35">Anomaly &gt;= (%)</span>
                <input value={wfThreshold} onChange={(e) => setWfThreshold(e.target.value)} disabled={wfRunning} className={`mt-1 w-20 ${field}`} />
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {wfRunning ? (
              <>
                <button onClick={stopWorkflow} className="rounded-lg border border-red-400/40 px-4 py-2 text-[13px] text-red-300 transition hover:bg-red-500/10">Stop</button>
                <button onClick={sendReport} className="rounded-lg border border-white/15 px-4 py-2 text-[13px] text-white/70 transition hover:bg-white/[0.06]">Send report now</button>
              </>
            ) : (
              <button onClick={runWorkflow} className="rounded-lg bg-[#9aa8f0] px-4 py-2 text-[13px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">Run workflow</button>
            )}
            <span className={`inline-flex items-center gap-1.5 text-[12px] ${wfRunning ? "text-emerald-300" : "text-white/35"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${wfRunning ? "bg-emerald-400" : "bg-white/20"}`} />
              {wfRunning ? "running — feed-agents writing to the network" : "idle"}
            </span>
            {wfReportMsg && <span className="text-[12px] text-white/45">{wfReportMsg}</span>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="text-sm font-medium text-white/80">Agents</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/40">Who can write to this set&apos;s shared memory. Revoke any agent and its next write bounces.</p>
          <div className="mt-3 space-y-1.5">
            {roster.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12.5px] text-white/30">No agents yet — run a workflow or grant one below.</div>
            ) : (
              roster.map((r) => (
                <div key={r.actor} className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.015] px-3 py-1.5 text-[12.5px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: colorFor(r.actor) }} />
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
            <button type="submit" className="rounded-md bg-[#9aa8f0] px-3 py-1.5 text-[12.5px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">grant</button>
          </form>
          {grantMsg && <p className="mt-2 text-[12px] text-white/45">{grantMsg}</p>}
        </div>
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
              datasets={rows.filter((r) => r.type === "file").map((r) => ({ id: r.id, label: r.title }))}
              feeds={wfFeeds.split(",").map((f) => f.trim()).filter(Boolean)}
              assets={wfAssets.split(",").map((a) => a.trim()).filter(Boolean)}
              strategy={wfStrategy.trim() || undefined}
              running={wfRunning}
              onRun={runFlow}
              onStop={stopWorkflow}
            />
          ) : (
            <NeuronGraph neurons={rows} colorOf={(id) => idColor.get(id) ?? "#64748b"} legend={legend} />
          )}
        </div>

        <div className="flex max-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#08090c]">
          <div className="border-b border-white/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-white/35">Live op feed</div>
          <div className="flex-1 overflow-y-auto">
            {feed.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-white/30">No activity yet. Run a workflow or grant an agent.</div>
            ) : (
              feed.map((f, i) => (
                <div key={i} className={`flex items-center gap-2 border-b border-white/[0.05] px-3 py-2 text-[12px] ${f.ok ? "" : "bg-red-500/5"}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.ok ? colorFor(f.actor) : "#ef4444" }} />
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
  );
}
