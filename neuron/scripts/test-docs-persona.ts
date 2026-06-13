import { answer } from "../src/reason/answer";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

async function main() {
  console.log("=== greeting, docs persona (no memory match) ===");
  const greet = await answer("hi", [], { docsName: "Walrus" });
  console.log(greet.text);
  console.log("\n=== off-topic question, docs persona ===");
  const off = await answer("what is your favorite color", [], { docsName: "Walrus" });
  console.log(off.text);
  console.log("\n=== same, DEFAULT memory persona (for contrast) ===");
  const mem = await answer("hi", []);
  console.log(mem.text);
}

main().catch((e) => { console.error("FAIL:", e.message ?? e); process.exit(1); });
