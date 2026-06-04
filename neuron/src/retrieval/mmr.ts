function jaccard(a: string, b: string): number {
  const sa = new Set(a.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const sb = new Set(b.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function mmrSelect<T>(
  items: T[],
  k: number,
  lambda: number,
  text: (x: T) => string,
  relevance: (x: T) => number,
): T[] {
  const pool = [...items];
  const selected: T[] = [];
  while (selected.length < k && pool.length) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const rel = relevance(pool[i]);
      const div = selected.length ? Math.max(...selected.map((s) => jaccard(text(pool[i]), text(s)))) : 0;
      const score = lambda * rel - (1 - lambda) * div;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    selected.push(pool.splice(best, 1)[0]);
  }
  return selected;
}
