import { createNeuron, type Neuron } from "../src/core/neuron";
import { NetHub } from "../src/net/hub";

async function main() {
  const hub = new NetHub();
  const ns: Neuron[] = [
    createNeuron({ type: "file", title: "doc.pdf", body: "a file", author: "self" }),
    createNeuron({ type: "chunk", title: "c1", body: "chunk one", author: "self" }),
    createNeuron({ type: "chunk", title: "c2", body: "chunk two", author: "self" }),
  ];
  const added = await hub.seed("default", ns);
  const snap = hub.snapshot("default");
  const reAdded = await hub.seed("default", ns);
  console.log(`added=${added} stateNeurons=${snap.neurons.length} root=${snap.root.slice(0, 16)} roster=[${snap.roster.map((r) => r.actor).join(",")}] reAdded=${reAdded}`);
  const pass = added === 3 && snap.neurons.length === 3 && reAdded === 0 && snap.roster.some((r) => r.actor === "self");
  console.log(pass ? "\nSEED PASS" : "\nSEED FAIL");
  process.exit(pass ? 0 : 1);
}

main();
