"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { neuronColor } from "../config";
import type { NeuronRow, NeuronType } from "@/services/neurus";

const W = 820;
const H = 540;
const MAX = 140;

interface GNode { id: string; type: NeuronType; title: string; deg: number; x: number; y: number; vx: number; vy: number; }
interface GEdge { a: string; b: string }

function build(neurons: NeuronRow[]) {
  const list = neurons.slice(0, MAX);
  const ids = new Set(list.map((n) => n.id));
  const deg = new Map<string, number>();
  const edges: GEdge[] = [];
  const neighbors = new Map<string, Set<string>>();
  const addN = (a: string, b: string) => (neighbors.get(a) ?? neighbors.set(a, new Set()).get(a)!).add(b);
  for (const n of list) {
    for (const s of n.synapses) {
      if (!ids.has(s.to) || s.to === n.id) continue;
      edges.push({ a: n.id, b: s.to });
      deg.set(n.id, (deg.get(n.id) ?? 0) + 1);
      deg.set(s.to, (deg.get(s.to) ?? 0) + 1);
      addN(n.id, s.to);
      addN(s.to, n.id);
    }
  }
  const nodes: GNode[] = list.map((n, i) => {
    const ang = (i / Math.max(1, list.length)) * Math.PI * 2;
    return { id: n.id, type: n.type, title: n.title, deg: deg.get(n.id) ?? 0, x: W / 2 + Math.cos(ang) * 190 + (Math.random() - 0.5) * 40, y: H / 2 + Math.sin(ang) * 150 + (Math.random() - 0.5) * 40, vx: 0, vy: 0 };
  });
  return { nodes, edges, neighbors, truncated: neurons.length > MAX };
}

function simulate(nodes: GNode[], edges: GEdge[], byId: Map<string, GNode>, alpha: number, dragId: string | null) {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) d2 = 1;
      const d = Math.sqrt(d2);
      const f = (2600 / d2) * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
  }
  for (const e of edges) {
    const a = byId.get(e.a), b = byId.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - 96) * 0.025 * alpha;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  for (const n of nodes) {
    n.vx += (W / 2 - n.x) * 0.004 * alpha;
    n.vy += (H / 2 - n.y) * 0.004 * alpha;
    if (n.id === dragId) { n.vx = 0; n.vy = 0; continue; }
    n.vx *= 0.86; n.vy *= 0.86;
    n.x = Math.max(24, Math.min(W - 24, n.x + n.vx));
    n.y = Math.max(24, Math.min(H - 24, n.y + n.vy));
  }
}

export function NeuronGraph({ neurons, colorOf, legend }: { neurons: NeuronRow[]; colorOf?: (id: string) => string; legend?: { label: string; color: string }[] }) {
  const { nodes, edges, neighbors, truncated } = useMemo(() => build(neurons), [neurons]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [, setFrame] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<string | null>(null);
  const raf = useRef(0);
  const alpha = useRef(1);
  const running = useRef(false);

  const start = () => {
    if (running.current || nodes.length === 0) return;
    running.current = true;
    const loop = () => {
      simulate(nodes, edges, byId, alpha.current, drag.current);
      alpha.current *= 0.99;
      setFrame((f) => f + 1);
      if (alpha.current > 0.02 || drag.current) raf.current = requestAnimationFrame(loop);
      else running.current = false;
    };
    raf.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    alpha.current = 1;
    start();
    return () => { cancelAnimationFrame(raf.current); running.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const toLocal = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (id: string) => (e: React.PointerEvent) => {
    drag.current = id;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    alpha.current = Math.max(alpha.current, 0.2);
    start();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const n = byId.get(drag.current);
    if (!n) return;
    const p = toLocal(e);
    n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0;
    setFrame((f) => f + 1);
  };
  const onUp = () => { drag.current = null; };

  if (nodes.length === 0) {
    return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-16 text-center text-sm text-white/40">No neurons to graph yet.</div>;
  }

  const lit = (id: string) => !hover || id === hover || neighbors.get(hover)?.has(id);
  const present = [...new Set(nodes.map((n) => n.type))];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#08090c]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { onUp(); setHover(null); }}
      >
        <defs>
          <radialGradient id="bg" cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor="#11131a" />
            <stop offset="100%" stopColor="#08090c" />
          </radialGradient>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#bg)" />

        {edges.map((e, i) => {
          const a = byId.get(e.a)!, b = byId.get(e.b)!;
          if (!a || !b) return null;
          const on = hover && (e.a === hover || e.b === hover);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? "#9aa8f0" : "#ffffff"} strokeOpacity={on ? 0.55 : hover ? 0.04 : 0.09} strokeWidth={on ? 1.4 : 1} />;
        })}

        {nodes.map((n) => {
          const r = 5 + Math.min(n.deg * 1.3, 9);
          const on = lit(n.id);
          return (
            <g key={n.id} opacity={on ? 1 : 0.18} style={{ cursor: "grab" }} onPointerDown={onDown(n.id)} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
              <circle cx={n.x} cy={n.y} r={r} fill={colorOf ? colorOf(n.id) : neuronColor[n.type]} filter={hover === n.id ? "url(#glow)" : undefined} stroke={hover === n.id ? "#fff" : "none"} strokeWidth={1.5} />
              {(hover === n.id || (hover && neighbors.get(hover)?.has(n.id))) && (
                <text x={n.x + r + 4} y={n.y + 3.5} fill="#fff" fillOpacity={0.85} fontSize={10} className="font-medium">
                  {n.title.length > 26 ? n.title.slice(0, 26) + "…" : n.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 px-4 py-2.5 text-[11px] text-white/40">
        {(legend ?? present.map((t) => ({ label: t, color: neuronColor[t] }))).map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="ml-auto text-white/25">{nodes.length} neurons · {edges.length} synapses · hover to focus, drag to move{truncated ? ` · showing first ${MAX}` : ""}</span>
      </div>
    </div>
  );
}
