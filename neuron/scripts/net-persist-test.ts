import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron } from "../src/core/neuron";

const BASE = process.env.NEURUS_API ?? "http://localhost:4318";
const SET = "ptest";
const SECRET = "scout-secret-p";

const post = (p: string, b: unknown) =>
  fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const get = (p: string) => fetch(`${BASE}${p}`).then((r) => r.json());

async function seed() {
  await post("/v1/net/grant", { set: SET, actor: "scout", secret: SECRET });
  const scout = new SharedReplica("scout", SECRET, new Capabilities());
  for (const t of ["alpha", "bravo", "charlie"]) {
    await post("/v1/net/op", { set: SET, op: scout.add(createNeuron({ type: "note", title: t, body: t, author: "scout" })) });
  }
  const cp = await post("/v1/net/checkpoint", {});
  const s = await get(`/v1/net/state?set=${SET}`);
  console.log(`SEED neurons=${s.neurons.length} root=${String(s.root).slice(0, 16)} checkpointed=${JSON.stringify((cp.checkpointed ?? []).map((x: any) => x.set))}`);
}

async function verify() {
  const s = await get(`/v1/net/state?set=${SET}`);
  const scout = new SharedReplica("scout", SECRET, new Capabilities());
  const w = await post("/v1/net/op", { set: SET, op: scout.add(createNeuron({ type: "note", title: "post-restart", body: "post-restart", author: "scout" })) });
  console.log(`VERIFY neurons=${s.neurons.length} root=${String(s.root).slice(0, 16)} roster=[${s.roster.map((x: any) => x.actor).join(",")}] postRestartWrite=${w.ok}`);
}

(process.argv.includes("verify") ? verify() : seed());
