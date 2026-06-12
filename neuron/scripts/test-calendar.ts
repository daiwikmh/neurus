import { Neurus } from "../src/index";
try { process.loadEnvFile(".env.local"); } catch {}
async function main() {
  const nx = await Neurus.open("cal-test");
  const events = [
    { id: "evt_1", summary: "Design review with Sarah", start: new Date(Date.now()+86400000).toISOString(), attendees: ["sarah@acme.com"], location: "Zoom" },
    { id: "evt_2", summary: "SUI strategy sync", start: new Date(Date.now()+172800000).toISOString(), description: "review trading-rules and DeepBook fills" },
  ];
  const r1 = await nx.addCalendar(events);
  const r2 = await nx.addCalendar(events);
  console.log("first:", r1, "second(dedup):", r2);
  const hits = await nx.recall("what meetings do I have with Sarah", { limit: 3 });
  console.log("recall:", hits.map(h => h.neuron.title).join(" | "));
  console.log(r1.added === 2 && r2.added === 0 && r2.skipped === 2 ? "OK" : "FAIL");
}
main().catch(e => { console.error("FAIL", e); process.exit(1); });
