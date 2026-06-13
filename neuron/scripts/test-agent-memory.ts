import { homedir } from "node:os";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createIdentity, tenantFor } from "../src/cli/identity";
import { Neurus } from "../src/index";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

async function main() {
  const id = await createIdentity("Atlas");
  console.log("agent:", id.name, "· address:", id.address.slice(0, 12) + "…");
  const tenant = tenantFor(id);
  const nx = await Neurus.open("default", { tenant });
  console.log("memory namespace behind account: neurus_" + tenant.id.slice(0, 12) + "…_<set>");
  const before = (await nx.neurons()).length;
  await nx.note("Sarah owes me a design review by Friday");
  const after = (await nx.neurons()).length;
  console.log("note written · neurons:", before, "->", after);
  const hits = await nx.recall("what does Sarah owe me", { limit: 3 });
  console.log("recall hits:", hits.length);
  for (const h of hits) console.log("  " + h.score.toFixed(2) + "  " + h.neuron.title + " :: " + h.neuron.body.replace(/\s+/g, " ").slice(0, 70));
  await rm(join(homedir(), ".neurus", "agent.json")).catch(() => {});
}

main().catch((e) => { console.error("FAIL:", e.message ?? e); process.exit(1); });
