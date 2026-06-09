import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron, type Neuron } from "../src/core/neuron";
import { NetworkManager } from "../src/net/manager";

const SCOUT = "scout-secret";
const ANALYST = "analyst-secret";

const obs = (actor: string, body: string): Neuron =>
  createNeuron({ type: "note", title: body.slice(0, 40), body, author: actor });

async function main() {
  const mgr = new NetworkManager();
  mgr.grant("defi", "scout", SCOUT);
  mgr.grant("defi", "analyst", ANALYST);

  const scout = new SharedReplica("scout", SCOUT, new Capabilities());
  const analyst = new SharedReplica("analyst", ANALYST, new Capabilities());

  const r1 = await mgr.submit("defi", scout.add(obs("scout", "Aave TVL $12.1B")));
  const r2 = await mgr.submit("defi", analyst.add(obs("analyst", "TVL up 4% vs yesterday")));
  console.log(`scout write ok=${r1.ok}  analyst write ok=${r2.ok}  neurons=${mgr.state("defi").length}`);

  const rogue = new SharedReplica("rogue", "not-granted", new Capabilities());
  const r3 = await mgr.submit("defi", rogue.add(obs("rogue", "malicious write")));
  console.log(`rogue write ok=${r3.ok}  reason="${r3.reason}"  neurons=${mgr.state("defi").length}`);

  const verCaps = new Capabilities();
  verCaps.grant("scout", SCOUT);
  verCaps.grant("analyst", ANALYST);
  const verifier = new SharedReplica("verifier", "v", verCaps);
  verifier.receive(mgr.log("defi"));
  const converged = mgr.root("defi") === verifier.root();
  console.log(`manager root=${mgr.root("defi").slice(0, 16)}  verifier root=${verifier.root().slice(0, 16)}  converged=${converged}`);

  mgr.revoke("defi", "scout");
  const r4 = await mgr.submit("defi", scout.add(obs("scout", "post-revoke write")));
  console.log(`post-revoke scout write ok=${r4.ok}  reason="${r4.reason}"  neurons=${mgr.state("defi").length}`);

  const pass = r1.ok && r2.ok && !r3.ok && converged && !r4.ok;
  console.log(pass ? "\nPASS" : "\nFAIL");
  process.exit(pass ? 0 : 1);
}

main();
