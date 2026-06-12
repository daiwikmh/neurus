import { NetHub } from "../src/net/hub";
import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron } from "../src/index";
import { scopeKey } from "../src/net/scope";

function signed(hub: NetHub, key: string, secret: string): SharedReplica {
  hub.grant(key, "self", secret, "write");
  const r = new SharedReplica("self", secret, new Capabilities());
  r.receive(hub.opsSince(key, 0));
  return r;
}

async function main() {
  const hub = new NetHub();
  const alice = scopeKey("0xalice", "default");
  const bob = scopeKey("0xbob", "default");
  console.log("alice key:", alice, "| bob key:", bob, "| local:", scopeKey("local", "default"));

  await hub.submit(alice, signed(hub, alice, "sa").add(createNeuron({ type: "note", title: "Alice position", body: "SUI long @ 0.70" })));
  await hub.submit(bob, signed(hub, bob, "sb").add(createNeuron({ type: "note", title: "Bob position", body: "ETH short @ 3000" })));

  const aView = hub.snapshot(alice).neurons.map((n) => n.title);
  const bView = hub.snapshot(bob).neurons.map((n) => n.title);
  console.log("alice sees:", aView, "| bob sees:", bView);

  const isolated = aView.length === 1 && aView[0] === "Alice position"
    && bView.length === 1 && bView[0] === "Bob position"
    && alice !== bob && scopeKey("local", "default") === "default";
  console.log(isolated ? "OK — isolated" : "FAIL — leaked");
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
