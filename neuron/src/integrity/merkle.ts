import { createHash } from "node:crypto";
import type { Neuron } from "../core/neuron";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function leafHash(n: Neuron): string {
  const canonical = JSON.stringify({
    id: n.id,
    type: n.type,
    body: n.body,
    blobId: n.blobId ?? null,
    trust: n.source.trust,
    author: n.source.author,
    synapses: [...n.synapses].sort((a, b) => (a.to + a.kind).localeCompare(b.to + b.kind)),
  });
  return sha(`leaf:${canonical}`);
}

export function merkleRoot(neurons: Neuron[]): string {
  if (neurons.length === 0) return sha("empty");
  let level = neurons.map(leafHash).sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? level[i];
      next.push(sha(`node:${a}${b}`));
    }
    level = next;
  }
  return level[0];
}
