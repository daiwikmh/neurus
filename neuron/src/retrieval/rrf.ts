export function rrf(rankings: string[][], k = 60): string[] {
  const score = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
