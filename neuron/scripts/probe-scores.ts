import { rerank } from "../src/retrieval/rerank";

const MEMORY = [
  "daiwik is their leader",
  "daiwik is leading the q3 deck and he wants it on Saturday",
  "Sarah needs the Q3 deck by Friday to brief her team",
  "Sarah is allergic to shellfish",
  "Tom Rivera asked when the Q3 deck will be ready",
  "Priya is blocked on her launch until the Q3 deck is finalized",
  "Booked a dentist appointment for next Tuesday morning",
];

const QUERIES: [string, string][] = [
  ["RELEVANT", "when is the q3 deck due"],
  ["RELEVANT-short", "what is sarah allergic to"],
  ["GREETING", "hi"],
  ["OFFTOPIC", "is someone ill"],
  ["OFFTOPIC", "what is the capital of france"],
  ["GREETING", "thanks, talk later"],
];

async function main() {
  for (const [label, q] of QUERIES) {
    const r = await rerank(q, MEMORY);
    const top = r.slice(0, 3);
    const sig = (x: number) => (1 / (1 + Math.exp(-x)) * 100).toFixed(1) + "%";
    console.log(`\n[${label}] "${q}"`);
    for (const t of top) console.log(`   ${t.score.toFixed(2)}  (${sig(t.score)})  ${t.text.slice(0, 46)}`);
  }
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
