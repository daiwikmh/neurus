import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron, type Neuron } from "../src/core/neuron";
import { NetHub } from "../src/net/hub";

const SCOUT = "scout-secret";
const obs = (actor: string, body: string): Neuron =>
  createNeuron({ type: "note", title: body.slice(0, 40), body, author: actor });

async function main() {
  const hub = new NetHub();
  const events: { event: string; data: any }[] = [];
  const unsub = hub.subscribe("defi", (event, data) => events.push({ event, data }));

  hub.grant("defi", "scout", SCOUT);
  const scout = new SharedReplica("scout", SCOUT, new Capabilities());

  const accepted = await hub.submit("defi", scout.add(obs("scout", "Aave TVL $12.1B")));
  const rogue = new SharedReplica("rogue", "nope", new Capabilities());
  const rejected = await hub.submit("defi", rogue.add(obs("rogue", "malicious")));

  const opEvents = events.filter((e) => e.event === "op");
  const grantBroadcast = events.some((e) => e.event === "roster");
  const sawAccept = opEvents.some((e) => e.data.ok === true);
  const sawReject = opEvents.some((e) => e.data.ok === false);
  const snap = hub.snapshot("defi");
  const opsBefore = opEvents.length;

  console.log(`events=${events.length} grantBroadcast=${grantBroadcast} accept=${sawAccept} reject=${sawReject} neurons=${snap.neurons.length} root=${snap.root.slice(0, 16)}`);

  unsub();
  await hub.submit("defi", scout.add(obs("scout", "after unsub")));
  const opsAfter = events.filter((e) => e.event === "op").length;
  console.log(`op events before unsub=${opsBefore} after unsub=${opsAfter} (delivery stopped=${opsBefore === opsAfter})`);

  const pass = accepted.ok && !rejected.ok && grantBroadcast && sawAccept && sawReject && snap.neurons.length === 1 && opsBefore === opsAfter;
  console.log(pass ? "\nPASS" : "\nFAIL");
  process.exit(pass ? 0 : 1);
}

main();
