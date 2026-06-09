"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  Position,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface Dataset {
  id: string;
  label: string;
}

interface Props {
  datasets: Dataset[];
  feeds: string[];
  assets: string[];
  strategy?: string;
  running: boolean;
  onRun: (cfg: { feeds: string[]; telegram: boolean }) => void;
  onStop: () => void;
}

const ANALYST = "agent:analyst";
const TELEGRAM = "out:telegram";

function nodeStyle(color: string): React.CSSProperties {
  return { background: "#0c0d12", color: "#e5e7eb", border: `1px solid ${color}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", width: 160 };
}

const mk = (id: string, label: string, x: number, y: number, color: string): Node => ({
  id,
  position: { x, y },
  data: { label },
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  style: nodeStyle(color),
});

const edge = (source: string, target: string): Edge => ({ id: `${source}->${target}`, source, target, animated: true, style: { stroke: "#9aa8f0aa" } });

function build(datasets: Dataset[], feeds: string[], assets: string[], strategy?: string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let y = 0;
  if (strategy) {
    nodes.push(mk("strategy", `${strategy} · strategy`, 0, y, "#2dd4bf"));
    edges.push(edge("strategy", ANALYST));
    y += 84;
  }
  for (const d of datasets) {
    nodes.push(mk(`ds:${d.id}`, d.label, 0, y, "#0d9488"));
    edges.push(edge(`ds:${d.id}`, ANALYST));
    y += 84;
  }
  for (const a of assets) {
    nodes.push(mk(`asset:${a}`, `${a.toUpperCase()} · price`, 0, y, "#34d399"));
    edges.push(edge(`asset:${a}`, ANALYST));
    y += 84;
  }
  for (const f of feeds) {
    nodes.push(mk(`feed:${f}`, `${f} · DefiLlama`, 0, y, "#f59e0b"));
    edges.push(edge(`feed:${f}`, ANALYST));
    y += 84;
  }
  const mid = Math.max(0, (y - 84) / 2);
  nodes.push(mk(ANALYST, "analyst", 280, mid, "#9333ea"));
  nodes.push(mk(TELEGRAM, "Telegram report", 560, mid, "#22d3ee"));
  edges.push(edge(ANALYST, TELEGRAM));
  return { nodes, edges };
}

export function NetworkCanvas({ datasets, feeds, assets, strategy, running, onRun, onStop }: Props) {
  const sig = useMemo(() => JSON.stringify([datasets.map((d) => d.id + d.label), feeds, assets, strategy]), [datasets, feeds, assets, strategy]);
  const initial = useMemo(() => build(datasets, feeds, assets, strategy), [sig]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [newFeed, setNewFeed] = useState("");

  useEffect(() => {
    const g = build(datasets, feeds, assets, strategy);
    setNodes(g.nodes);
    setEdges(g.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#9aa8f0aa" } }, eds)), [setEdges]);

  const addFeed = () => {
    const slug = newFeed.trim().toLowerCase();
    if (!slug) return;
    const id = `feed:${slug}`;
    setNodes((n) => (n.some((x) => x.id === id) ? n : [...n, mk(id, `${slug} · DefiLlama`, 0, n.length * 84, "#f59e0b")]));
    setEdges((e) => (e.some((x) => x.id === `${id}->${ANALYST}`) ? e : [...e, edge(id, ANALYST)]));
    setNewFeed("");
  };

  const run = () => {
    const activeFeeds = nodes.filter((n) => n.id.startsWith("feed:") && edges.some((e) => e.source === n.id)).map((n) => n.id.slice(5));
    const telegram = edges.some((e) => e.source === ANALYST && e.target === TELEGRAM);
    onRun({ feeds: activeFeeds, telegram });
  };

  const fieldCls = "rounded-md border border-white/10 bg-[#0c0d12] px-2 py-1 text-[12px] text-white outline-none placeholder:text-white/30";

  return (
    <div className="h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#08090c]">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView colorMode="dark" proOptions={{ hideAttribution: true }}>
        <Panel position="top-left" className="flex items-center gap-1.5">
          <input value={newFeed} onChange={(e) => setNewFeed(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFeed()} placeholder="add feed (e.g. compound)" className={`w-44 ${fieldCls}`} />
          <button onClick={addFeed} className="rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[12px] text-white/80 transition hover:bg-white/10">add</button>
          {running ? (
            <button onClick={onStop} className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1 text-[12px] text-red-300 transition hover:bg-red-500/20">Stop flow</button>
          ) : (
            <button onClick={run} className="rounded-md bg-[#9aa8f0] px-3 py-1 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">Run flow</button>
          )}
        </Panel>
        <Background gap={22} color="#ffffff12" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
