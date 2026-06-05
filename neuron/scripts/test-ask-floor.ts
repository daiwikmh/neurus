import { hasRelevantContext } from "../src/reason/answer";
import { createNeuron } from "../src/core/neuron";
import type { RankedNeuron } from "../src/core/memory";

function hits(...scores: number[]): RankedNeuron[] {
  return scores.map((score) => ({
    neuron: createNeuron({ type: "note", title: "n", body: "n" }),
    score,
    relevance: 1 / (1 + Math.exp(-score)),
  }));
}

const checks: [string, boolean][] = [];
const check = (name: string, cond: boolean) => checks.push([name, cond]);

check("empty → no context (abstain)", hasRelevantContext([]) === false);
check("greeting 'hi' (-9.58) → abstain", hasRelevantContext(hits(-9.58, -10.0, -10.37)) === false);
check("offtopic 'capital of france' (-11.08) → abstain", hasRelevantContext(hits(-11.08, -11.1, -11.15)) === false);
check("relevant 'q3 deck due' (+1.83) → answer", hasRelevantContext(hits(1.83, 0.89, 0.78)) === true);
check("relevant short 'allergic' (+8.51) → answer", hasRelevantContext(hits(8.51, -10.83, -11.38)) === true);
check("weak-but-real top (-4) above floor → answer", hasRelevantContext(hits(-4, -9, -10)) === true);
check("just below floor (-6) → abstain", hasRelevantContext(hits(-6, -9, -10)) === false);

let ok = true;
for (const [name, cond] of checks) {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) ok = false;
}
console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
if (!ok) process.exit(1);
