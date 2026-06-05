export function softmaxShares(scores: number[], temp = 2): number[] {
  const n = scores.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temp));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function concentration(shares: number[]): number {
  const n = shares.length;
  if (n <= 1) return n === 1 ? 1 : 0;
  const top = Math.max(...shares);
  return Math.min(1, Math.max(0, (top * n - 1) / (n - 1)));
}

export function relativeRelevance(scores: number[], temp = 2): number[] {
  const shares = softmaxShares(scores, temp);
  if (shares.length <= 1) return shares.length ? [1] : [];
  const top = Math.max(...shares);
  const conf = concentration(shares);
  return shares.map((s) => (s / top) * conf);
}

export function standsOut(scores: number[], temp = 2): number {
  return concentration(softmaxShares(scores, temp));
}
