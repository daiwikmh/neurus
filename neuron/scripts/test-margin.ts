import { softmaxShares, concentration, relativeRelevance, standsOut } from "../src/retrieval/margin";

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

const checks: [string, boolean][] = [];
const check = (name: string, cond: boolean) => checks.push([name, cond]);

check("empty → []", relativeRelevance([]).length === 0);
check("single → [1]", relativeRelevance([5]).length === 1 && relativeRelevance([5])[0] === 1);

const peaked = relativeRelevance([9, -2, -3]);
check("peaked: top → confidence (~0.99)", peaked[0] > 0.95 && peaked[0] <= 1);
check("peaked: rest → ~0", peaked[1] < 0.05 && peaked[2] < 0.05);
check("peaked: standsOut high", standsOut([9, -2, -3]) > 0.9);

const flat = relativeRelevance([1, 1, 1]);
check("flat: all → 0 (nothing stands out)", flat.every((x) => approx(x, 0)));
check("flat: standsOut → 0", approx(standsOut([1, 1, 1]), 0));

check("softmax sums to 1", approx(softmaxShares([3, 1, -1]).reduce((a, b) => a + b, 0), 1, 1e-9));
check("concentration uniform → 0", approx(concentration([0.25, 0.25, 0.25, 0.25]), 0));
check("concentration dominant → ~1", concentration([0.97, 0.01, 0.01, 0.01]) > 0.95);

const mid = standsOut([10, 9, 0]);
check("partial separation → mid confidence", mid > 0.2 && mid < 0.9);

let ok = true;
for (const [name, cond] of checks) {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) ok = false;
}
console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
if (!ok) process.exit(1);
