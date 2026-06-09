interface LeafNeuron {
  id: string;
  type: string;
  body: string;
  blobId?: string;
  source: { author: string; trust: string };
  synapses: { to: string; kind: string }[];
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function leafHash(n: LeafNeuron): Promise<string> {
  const canonical = JSON.stringify({
    id: n.id,
    type: n.type,
    body: n.body,
    blobId: n.blobId ?? null,
    trust: n.source.trust,
    author: n.source.author,
    synapses: [...n.synapses].sort((a, b) => (a.to + a.kind).localeCompare(b.to + b.kind)),
  });
  return sha256Hex(`leaf:${canonical}`);
}

export async function merkleRoot(neurons: LeafNeuron[]): Promise<string> {
  if (neurons.length === 0) return sha256Hex("empty");
  let level = (await Promise.all(neurons.map(leafHash))).sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(await sha256Hex(`node:${level[i]}${level[i + 1] ?? level[i]}`));
    }
    level = next;
  }
  return level[0];
}
