export interface PlayMeta {
  kind: "play";
  asset: string;
  direction: "long" | "short";
  entry: number;
  target?: number;
  stop?: number;
  thesis?: string;
  status: "open" | "closed";
  openedAt: number;
  exit?: number;
  closedAt?: number;
  plPct?: number;
}

export interface PlayMath {
  plPct: number;
  distToStop: number | null;
  distToTarget: number | null;
  hitStop: boolean;
  hitTarget: boolean;
}

export const fmtPrice = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`);

export function playMath(p: PlayMeta, current: number): PlayMath {
  const sign = p.direction === "long" ? 1 : -1;
  const plPct = ((current - p.entry) / p.entry) * 100 * sign;
  const distToStop = p.stop != null ? ((current - p.stop) / current) * 100 * sign : null;
  const distToTarget = p.target != null ? ((p.target - current) / current) * 100 * sign : null;
  return {
    plPct,
    distToStop,
    distToTarget,
    hitStop: p.stop != null && (p.direction === "long" ? current <= p.stop : current >= p.stop),
    hitTarget: p.target != null && (p.direction === "long" ? current >= p.target : current <= p.target),
  };
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export function describePlay(p: PlayMeta, current: number, m: PlayMath): string {
  const parts = [`${p.asset.toUpperCase()} ${p.direction} @ ${fmtPrice(p.entry)}: now ${fmtPrice(current)} (${pct(m.plPct)})`];
  if (p.stop != null && m.distToStop != null) parts.push(`stop ${fmtPrice(p.stop)} margin ${m.distToStop.toFixed(2)}%${m.hitStop ? " HIT" : ""}`);
  if (p.target != null && m.distToTarget != null) parts.push(`target ${fmtPrice(p.target)} needs ${pct(m.distToTarget)}${m.hitTarget ? " HIT" : ""}`);
  return parts.join("; ");
}

export function describeClose(p: PlayMeta, exit: number): string {
  const sign = p.direction === "long" ? 1 : -1;
  const plPct = ((exit - p.entry) / p.entry) * 100 * sign;
  return `${p.asset.toUpperCase()} ${p.direction} closed: entry ${fmtPrice(p.entry)} → exit ${fmtPrice(exit)} (${pct(plPct)})`;
}
