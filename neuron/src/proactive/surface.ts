import type { Memory } from "../core/memory";
import type { Neuron } from "../core/neuron";

const DAY = 86_400_000;

export interface Surfacing {
  neuron: Neuron;
  score: number;
  reason: string;
}

export interface SurfaceOptions {
  context?: string;
  limit?: number;
  bar?: number;
}

export async function surface(mem: Memory, opts: SurfaceOptions = {}): Promise<Surfacing[]> {
  await mem.ready();
  const candidates = mem.all().filter((n) => n.type === "insight" || n.type === "commitment");
  if (candidates.length === 0) return [];

  const relevanceById = new Map<string, number>();
  if (opts.context) {
    const ranked = await mem.recall(opts.context, { limit: candidates.length, overFetch: candidates.length + 10 });
    for (const r of ranked) relevanceById.set(r.neuron.id, r.relevance);
  }

  const now = Date.now();
  const scored = candidates.map((n) => {
    const importance = (n.meta?.importance as number) ?? (n.type === "commitment" ? 0.7 : 0.5);
    const recency = Math.exp(-(now - n.createdAt) / DAY / 7);
    const relevance = opts.context ? (relevanceById.get(n.id) ?? 0.5) : 0.5;
    const score = 0.45 * importance + 0.3 * relevance + 0.25 * recency;
    return { neuron: n, score, reason: `imp ${importance.toFixed(2)} · rel ${relevance.toFixed(2)} · rec ${recency.toFixed(2)}` };
  });

  return scored
    .filter((s) => s.score >= (opts.bar ?? 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 5);
}
