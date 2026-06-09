import { createNeuron } from "../src/core/neuron";
import { merkleRoot as serverRoot } from "../src/integrity/merkle";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function leafHash(n: any): Promise<string> {
  const canonical = JSON.stringify({
    id: n.id,
    type: n.type,
    body: n.body,
    blobId: n.blobId ?? null,
    trust: n.source.trust,
    author: n.source.author,
    synapses: [...n.synapses].sort((a: any, b: any) => (a.to + a.kind).localeCompare(b.to + b.kind)),
  });
  return sha256Hex(`leaf:${canonical}`);
}

async function clientRoot(neurons: any[]): Promise<string> {
  if (neurons.length === 0) return sha256Hex("empty");
  let level = (await Promise.all(neurons.map(leafHash))).sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(await sha256Hex(`node:${level[i]}${level[i + 1] ?? level[i]}`));
    level = next;
  }
  return level[0];
}

async function main() {
  const ns = [
    createNeuron({ type: "note", title: "a", body: "alpha", author: "x" }),
    createNeuron({ type: "note", title: "b", body: "bravo", author: "y" }),
    createNeuron({ type: "insight", title: "c", body: "charlie", author: "x" }),
  ];
  const s = serverRoot(ns);
  const c = await clientRoot(ns);
  const e1 = serverRoot([]);
  const e2 = await clientRoot([]);
  console.log(`server=${s.slice(0, 16)} client=${c.slice(0, 16)} match=${s === c}`);
  console.log(`empty: server=${e1.slice(0, 16)} client=${e2.slice(0, 16)} match=${e1 === e2}`);
  const pass = s === c && e1 === e2;
  console.log(pass ? "\nPARITY PASS" : "\nPARITY FAIL");
  process.exit(pass ? 0 : 1);
}

main();
