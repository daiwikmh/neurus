import { Neurus, createNeuron } from "../src/index";
try { process.loadEnvFile(".env.local"); } catch {}
async function main() {
  const nx = await Neurus.open("wgt-scope-test");
  const mem = (nx as any).mem;
  await mem.remember(createNeuron({ type: "note", title: "Solar warranty", body: "Our solar panels carry a 25-year performance warranty.", meta: { datasetId: "ds_alpha" } }));
  await mem.remember(createNeuron({ type: "note", title: "Returns", body: "Customers may return unused panels within 30 days for a refund.", meta: { datasetId: "ds_beta" } }));
  const pool = await nx.recall("warranty and returns", { limit: 40 });
  const onlyAlpha = pool.filter(h => h.neuron.meta?.datasetId === "ds_alpha");
  const onlyBeta = pool.filter(h => h.neuron.meta?.datasetId === "ds_beta");
  console.log("pool:", pool.map(h => h.neuron.meta?.datasetId));
  console.log("alpha-scoped:", onlyAlpha.map(h => h.neuron.title));
  console.log("beta-scoped:", onlyBeta.map(h => h.neuron.title));
  const ok = onlyAlpha.every(h => h.neuron.meta?.datasetId === "ds_alpha") && onlyAlpha.length >= 1
    && onlyBeta.every(h => h.neuron.meta?.datasetId === "ds_beta") && !onlyAlpha.some(h => h.neuron.title === "Returns");
  console.log(ok ? "OK" : "FAIL");
}
main().catch(e => { console.error("FAIL", e?.message ?? e); process.exit(1); });
