import { createNeuron, type Neuron } from "../src/core/neuron";
import { surface } from "../src/proactive/surface";
import type { Memory, RankedNeuron } from "../src/core/memory";

function stubMemory(candidates: Neuron[], rawScores: Map<string, number>): Memory {
  return {
    ready: async () => {},
    all: () => candidates,
    recall: async (_q: string): Promise<RankedNeuron[]> =>
      candidates
        .filter((n) => n.type === "insight" && rawScores.has(n.id))
        .map((n) => ({ neuron: n, score: rawScores.get(n.id)!, relevance: 0 }))
        .sort((a, b) => b.score - a.score),
  } as unknown as Memory;
}

function insight(body: string, importance: number): Neuron {
  return createNeuron({ type: "insight", title: body.slice(0, 20), body, meta: { importance } });
}

async function main() {
  const a = insight("The Q3 deck is the bottleneck — Priya, Tom, Sarah all depend on it", 0.6);
  const b = insight("Office plants need watering this week", 0.6);
  const c = insight("Consider switching the standup to mornings", 0.6);
  const commit = createNeuron({ type: "commitment", title: "send deck", body: "Owe Sarah the Q3 deck by Friday" });
  const candidates = [a, b, c, commit];

  console.log("=== peaked context: 'when is the Q3 deck due' — one insight dominates ===");
  const peaked = stubMemory(candidates, new Map([[a.id, 9], [b.id, -2], [c.id, -3]]));
  const r1 = await surface(peaked, { context: "when is the Q3 deck due" });
  for (const it of r1) console.log(`  → [${it.score.toFixed(2)}] (${it.neuron.type}) ${it.neuron.body.slice(0, 44)}  · ${it.reason}`);
  const relA = r1.find((x) => x.neuron.id === a.id)!;
  const relB = r1.find((x) => x.neuron.id === b.id)!;
  const commitRow = r1.find((x) => x.neuron.id === commit.id)!;
  const passPeaked = relA.score > relB.score && commitRow.reason.includes("rel —");
  console.log(`  dominant insight outranks irrelevant one: ${relA.score.toFixed(2)} > ${relB.score.toFixed(2)} · commitment skips relevance: ${commitRow.reason.includes("rel —")} → ${passPeaked ? "PASS" : "FAIL"}`);

  console.log("\n=== flat context: nothing stands out — gate stays quiet on relevance ===");
  const flat = stubMemory(candidates, new Map([[a.id, 1], [b.id, 1], [c.id, 1]]));
  const r2 = await surface(flat, { context: "unrelated chatter" });
  const flatRelMax = Math.max(...r2.filter((x) => x.neuron.type === "insight").map((x) => Number(x.reason.match(/rel ([\d.]+)/)?.[1] ?? "1")));
  const passFlat = flatRelMax < 0.1;
  console.log(`  max insight relevance when flat: ${flatRelMax.toFixed(3)} (< 0.10 expected) → ${passFlat ? "PASS" : "FAIL"}`);

  console.log("\n=== no context: 2-term gate, all relevance absent ===");
  const r3 = await surface(stubMemory(candidates, new Map()), {});
  const passNoCtx = r3.every((x) => x.reason.includes("rel —"));
  console.log(`  every item skips relevance term: ${passNoCtx ? "PASS" : "FAIL"}`);

  const ok = passPeaked && passFlat && passNoCtx;
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
