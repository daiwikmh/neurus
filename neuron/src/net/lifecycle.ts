import type { Neuron } from "../core/neuron";
import { fmtPrice } from "./plays";

const fmtUsd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface TrendStats {
  metric: string;
  label: string;
  unit: "usd" | "price";
  from: number;
  to: number;
  count: number;
  min: number;
  max: number;
  mean: number;
  first: number;
  last: number;
  deltaPct: number;
  anomalies: number;
}

export interface ConsolidationPlan {
  trends: { stats: TrendStats; consolidatedIds: string[] }[];
}

interface Obs {
  id: string;
  createdAt: number;
  value: number;
  anomaly: boolean;
}

interface Group {
  label: string;
  unit: "usd" | "price";
  obs: Obs[];
}

function classify(n: Neuron): { key: string; label: string; unit: "usd" | "price"; value: number } | null {
  const m = n.meta as Record<string, unknown> | undefined;
  if (!m || n.type !== "note") return null;
  if (typeof m.metric === "string" && typeof m.value === "number") return { key: `tvl:${m.metric}`, label: `${titleCase(m.metric)} TVL`, unit: "usd", value: m.value };
  if (typeof m.asset === "string" && typeof m.value === "number") return { key: `price:${m.asset}`, label: `${m.asset.toUpperCase()} price`, unit: "price", value: m.value };
  if (m.kind === "portfolio_snapshot" && typeof m.totalUsd === "number" && typeof m.address === "string") {
    const a = m.address as string;
    return { key: `wallet:${a}`, label: `Wallet ${a.slice(0, 6)}…${a.slice(-4)}`, unit: "usd", value: m.totalUsd };
  }
  return null;
}

export function planConsolidation(neurons: Neuron[], opts: { keepRecent?: number; minBatch?: number } = {}): ConsolidationPlan {
  const keepRecent = opts.keepRecent ?? 10;
  const minBatch = opts.minBatch ?? 4;

  const referenced = new Set<string>();
  for (const n of neurons) {
    const pid = (n.meta as Record<string, unknown> | undefined)?.playId;
    if (typeof pid === "string") referenced.add(pid);
    for (const s of n.synapses) referenced.add(s.to);
  }

  const groups = new Map<string, Group>();
  for (const n of neurons) {
    const c = classify(n);
    if (!c) continue;
    let g = groups.get(c.key);
    if (!g) {
      g = { label: c.label, unit: c.unit, obs: [] };
      groups.set(c.key, g);
    }
    g.obs.push({ id: n.id, createdAt: n.createdAt, value: c.value, anomaly: (n.meta as Record<string, unknown>).anomaly === true });
  }

  const trends: ConsolidationPlan["trends"] = [];
  for (const [metric, g] of groups) {
    const sorted = [...g.obs].sort((a, b) => a.createdAt - b.createdAt);
    const older = sorted.slice(0, Math.max(0, sorted.length - keepRecent));
    const fold = older.filter((o) => !o.anomaly && !referenced.has(o.id));
    if (fold.length < minBatch) continue;

    const values = fold.map((o) => o.value);
    const first = values[0];
    const last = values[values.length - 1];
    trends.push({
      stats: {
        metric,
        label: g.label,
        unit: g.unit,
        from: fold[0].createdAt,
        to: fold[fold.length - 1].createdAt,
        count: fold.length,
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((s, v) => s + v, 0) / values.length,
        first,
        last,
        deltaPct: first !== 0 ? ((last - first) / first) * 100 : 0,
        anomalies: older.filter((o) => o.anomaly).length,
      },
      consolidatedIds: fold.map((o) => o.id),
    });
  }
  return { trends };
}

export function describeTrend(s: TrendStats): string {
  const f = s.unit === "price" ? fmtPrice : fmtUsd;
  const hours = Math.max(1, Math.round((s.to - s.from) / 3_600_000));
  const net = `${s.deltaPct >= 0 ? "+" : ""}${s.deltaPct.toFixed(2)}%`;
  const anom = s.anomalies ? `; ${s.anomalies} anomaly flag(s) kept separately` : "";
  return `${s.label} — ${s.count} observations over ~${hours}h: min ${f(s.min)} / mean ${f(s.mean)} / max ${f(s.max)}, ${net} net (${f(s.first)} → ${f(s.last)})${anom}`;
}
