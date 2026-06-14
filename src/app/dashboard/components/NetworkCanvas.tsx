"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { fieldCls, btnPrimarySm, btnGhostSm, btnDangerSm } from "./ui";

interface Dataset {
  id: string;
  label: string;
}

interface Props {
  datasets: Dataset[];
  feeds: string[];
  assets: string[];
  wallets: string[];
  deepbook?: boolean;
  strategy?: string;
  running: boolean;
  setKey?: string;
  onRun: (cfg: { feeds: string[]; telegram: boolean }) => void;
  onStop: () => void;
}

const hiddenKey = (setKey?: string) => `neurus.canvas.hidden.${setKey || "default"}`;

function loadHidden(setKey?: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(hiddenKey(setKey)) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveHidden(setKey: string | undefined, hidden: Set<string>): void {
  try {
    localStorage.setItem(hiddenKey(setKey), JSON.stringify([...hidden]));
  } catch {
    /* storage unavailable */
  }
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const ANALYST = "agent:analyst";
const TELEGRAM = "out:telegram";

function nodeStyle(color: string): React.CSSProperties {
  return { background: "#0c0d12", color: "#e5e7eb", border: `1px solid ${color}`, borderRadius: 10, fontSize: 12, padding: "8px 10px", width: 160 };
}

const mk = (id: string, label: string, x: number, y: number, color: string, deletable = true): Node => ({
  id,
  position: { x, y },
  data: { label },
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  style: nodeStyle(color),
  deletable,
});

const edge = (source: string, target: string): Edge => ({ id: `${source}->${target}`, source, target, animated: true, style: { stroke: "#9aa8f0aa" } });

function build(datasets: Dataset[], feeds: string[], assets: string[], wallets: string[], deepbook: boolean, strategy?: string): { nodes: Node[]; edges: Edge[] } {
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
  for (const w of wallets) {
    nodes.push(mk(`wallet:${w}`, `${shortAddr(w)} · wallet`, 0, y, "#38bdf8"));
    edges.push(edge(`wallet:${w}`, ANALYST));
    y += 84;
  }
  if (deepbook) {
    nodes.push(mk("deepbook", "DeepBook · trades", 0, y, "#fb923c"));
    edges.push(edge("deepbook", ANALYST));
    y += 84;
  }
  for (const f of feeds) {
    nodes.push(mk(`feed:${f}`, `${f} · DefiLlama`, 0, y, "#f59e0b"));
    edges.push(edge(`feed:${f}`, ANALYST));
    y += 84;
  }
  const mid = Math.max(0, (y - 84) / 2);
  nodes.push(mk(ANALYST, "analyst", 280, mid, "#9333ea", false));
  nodes.push(mk(TELEGRAM, "Telegram report", 560, mid, "#22d3ee", false));
  edges.push(edge(ANALYST, TELEGRAM));
  return { nodes, edges };
}

export function NetworkCanvas({ datasets, feeds, assets, wallets, deepbook, strategy, running, setKey, onRun, onStop }: Props) {
  const sig = useMemo(() => JSON.stringify([datasets.map((d) => d.id + d.label), feeds, assets, wallets, deepbook, strategy]), [datasets, feeds, assets, wallets, deepbook, strategy]);
  const initial = useMemo(() => build(datasets, feeds, assets, wallets, !!deepbook, strategy), [sig]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [newFeed, setNewFeed] = useState("");
  // Nodes the user explicitly removed — persisted per-set so they don't reappear on rebuild or reload.
  const removed = useRef<Set<string>>(loadHidden(setKey));
  const [hiddenCount, setHiddenCount] = useState(0);

  // Reload the hidden set when switching sets (removals are scoped per-set).
  useEffect(() => {
    removed.current = loadHidden(setKey);
    setHiddenCount(removed.current.size);
  }, [setKey]);

  useEffect(() => {
    const g = build(datasets, feeds, assets, wallets, !!deepbook, strategy);
    const hide = removed.current;
    setNodes(g.nodes.filter((n) => !hide.has(n.id)));
    setEdges(g.edges.filter((e) => !hide.has(e.source) && !hide.has(e.target)));
    setHiddenCount([...hide].filter((id) => g.nodes.some((n) => n.id === id)).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#9aa8f0aa" } }, eds)), [setEdges]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    for (const d of deleted) removed.current.add(d.id);
    saveHidden(setKey, removed.current);
    setHiddenCount(removed.current.size);
  }, [setKey]);

  const restoreHidden = () => {
    removed.current = new Set();
    saveHidden(setKey, removed.current);
    setHiddenCount(0);
    const g = build(datasets, feeds, assets, wallets, !!deepbook, strategy);
    setNodes(g.nodes);
    setEdges(g.edges);
  };

  const deleteSelected = () => {
    const ids = nodes.filter((n) => n.selected && n.deletable !== false).map((n) => n.id);
    if (!ids.length) return;
    for (const id of ids) removed.current.add(id);
    saveHidden(setKey, removed.current);
    setHiddenCount(removed.current.size);
    const drop = new Set(ids);
    setNodes((ns) => ns.filter((n) => !drop.has(n.id)));
    setEdges((es) => es.filter((e) => !drop.has(e.source) && !drop.has(e.target)));
  };

  const addFeed = () => {
    const slug = newFeed.trim().toLowerCase();
    if (!slug) return;
    const id = `feed:${slug}`;
    if (removed.current.delete(id)) { saveHidden(setKey, removed.current); setHiddenCount(removed.current.size); }
    setNodes((n) => (n.some((x) => x.id === id) ? n : [...n, mk(id, `${slug} · DefiLlama`, 0, n.length * 84, "#f59e0b")]));
    setEdges((e) => (e.some((x) => x.id === `${id}->${ANALYST}`) ? e : [...e, edge(id, ANALYST)]));
    setNewFeed("");
  };

  const run = () => {
    const activeFeeds = nodes.filter((n) => n.id.startsWith("feed:") && edges.some((e) => e.source === n.id)).map((n) => n.id.slice(5));
    const telegram = edges.some((e) => e.source === ANALYST && e.target === TELEGRAM);
    onRun({ feeds: activeFeeds, telegram });
  };

  return (
    <div className="h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#08090c]">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodesDelete={onNodesDelete} onConnect={onConnect} deleteKeyCode={["Backspace", "Delete"]} fitView colorMode="dark" proOptions={{ hideAttribution: true }}>
        <Panel position="top-left" className="flex items-center gap-1.5">
          <input value={newFeed} onChange={(e) => setNewFeed(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFeed()} placeholder="add feed (e.g. compound)" className={`w-44 ${fieldCls}`} />
          <button onClick={addFeed} className={btnGhostSm}>add</button>
          {running ? (
            <button onClick={onStop} className={btnDangerSm}>Stop flow</button>
          ) : (
            <button onClick={run} className={btnPrimarySm}>Run flow</button>
          )}
          <button onClick={deleteSelected} className={btnGhostSm}>Delete</button>
        </Panel>
        <Panel position="bottom-left" className="flex items-center gap-2 rounded-md bg-black/40 px-2 py-1 text-[10px] text-white/40">
          select a node · press Delete to remove
          {hiddenCount > 0 && (
            <button onClick={restoreHidden} className="text-[#aeb9f4] underline-offset-2 hover:underline">
              {hiddenCount} hidden · restore
            </button>
          )}
        </Panel>
        <Background gap={22} color="#ffffff12" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
