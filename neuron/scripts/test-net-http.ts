import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron } from "../src/core/neuron";

const BASE = process.env.NEURUS_API ?? "http://localhost:4318";
const SET = "defihttp";
const SCOUT = "scout-secret-http";

const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (path: string) => fetch(`${BASE}${path}`).then((r) => r.json());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const health = await get("/v1/health");
  console.log(`health ok=${health.ok} name=${health.name}`);

  const events: { ev: string; data: any }[] = [];
  const ac = new AbortController();
  const sse = fetch(`${BASE}/v1/net/stream?set=${SET}`, { signal: ac.signal }).then(async (res) => {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const b of blocks) {
          let ev = "message";
          let data = "";
          for (const line of b.split("\n")) {
            if (line.startsWith("event:")) ev = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data) events.push({ ev, data: JSON.parse(data) });
        }
      }
    } catch {
      void 0;
    }
  });

  await wait(400);
  await post("/v1/net/grant", { set: SET, actor: "scout", secret: SCOUT });

  const scout = new SharedReplica("scout", SCOUT, new Capabilities());
  const r1 = await post("/v1/net/op", { set: SET, op: scout.add(createNeuron({ type: "note", title: "Aave TVL $12.1B", body: "Aave TVL $12.1B", author: "scout" })) });
  console.log(`valid op ok=${r1.ok} root=${String(r1.root).slice(0, 12)}`);

  const rogue = new SharedReplica("rogue", "nope", new Capabilities());
  const r2 = await post("/v1/net/op", { set: SET, op: rogue.add(createNeuron({ type: "note", title: "malicious", body: "malicious", author: "rogue" })) });
  console.log(`rogue op ok=${r2.ok} reason="${r2.reason}"`);

  await wait(300);
  const state = await get(`/v1/net/state?set=${SET}`);
  console.log(`state neurons=${state.neurons.length} roster=[${state.roster.map((x: any) => x.actor).join(",")}]`);

  await post("/v1/net/revoke", { set: SET, actor: "scout" });
  const r3 = await post("/v1/net/op", { set: SET, op: scout.add(createNeuron({ type: "note", title: "post-revoke", body: "post-revoke", author: "scout" })) });
  console.log(`post-revoke op ok=${r3.ok} reason="${r3.reason}"`);

  await wait(300);
  ac.abort();
  await sse.catch(() => {});

  const ops = events.filter((e) => e.ev === "op");
  const sawState = events.some((e) => e.ev === "state");
  const sawAccept = ops.some((e) => e.data.ok === true);
  const sawReject = ops.some((e) => e.data.ok === false);
  console.log(`sse events=${events.length} initialState=${sawState} accept=${sawAccept} reject=${sawReject}`);

  const pass = health.ok && r1.ok === true && r2.ok === false && state.neurons.length === 1 && r3.ok === false && sawState && sawAccept && sawReject;
  console.log(pass ? "\nHTTP PASS" : "\nHTTP FAIL");
  process.exit(pass ? 0 : 1);
}

main();
