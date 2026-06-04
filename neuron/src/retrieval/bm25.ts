function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
}

export interface BM25Doc {
  id: string;
  text: string;
}

export class BM25 {
  private k1 = 1.5;
  private b = 0.75;
  private docs: { id: string; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private avgdl = 1;

  constructor(docs: BM25Doc[]) {
    for (const d of docs) {
      const tokens = tokenize(d.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.docs.push({ id: d.id, tf, len: tokens.length });
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    if (this.docs.length) this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / this.docs.length;
  }

  search(query: string, k: number): { id: string; score: number }[] {
    const q = [...new Set(tokenize(query))];
    const N = this.docs.length;
    return this.docs
      .map((d) => {
        let s = 0;
        for (const t of q) {
          const f = d.tf.get(t);
          if (!f) continue;
          const n = this.df.get(t) ?? 0;
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          s += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * (d.len / this.avgdl)));
        }
        return { id: d.id, score: s };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
