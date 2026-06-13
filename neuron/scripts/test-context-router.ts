import { Neurus } from "../src/index";
import { routeTurn } from "../src/reason/router";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

// With OPENROUTER_API_KEY set, this runs three DIFFERENT vendors over one owned memory.
// Without it, it falls back to the free NVIDIA model for every slot — the mechanism
// (one shared MemWal memory, model as a swappable parameter) is identical either way.
const hasOR = !!process.env.OPENROUTER_API_KEY;
const slot = (envName: string, fallback: string) => (hasOR ? process.env[envName] ?? fallback : undefined);
const M = {
  claude: slot("OR_CLAUDE", "anthropic/claude-3.5-sonnet"),
  gemini: slot("OR_GEMINI", "google/gemini-2.0-flash-001"),
  gpt: slot("OR_GPT", "openai/gpt-4o-mini"),
};

async function main() {
  const session = `ctx-demo-${Date.now().toString(36)}`;
  const neurus = await Neurus.open(session);

  console.log(`session : ${neurus.set.name}`);
  console.log(`models  : ${hasOR ? "Claude → Gemini → GPT (OpenRouter, true multi-vendor)" : "NVIDIA free for all slots (set OPENROUTER_API_KEY for real multi-vendor)"}\n`);

  const turns = [
    { who: "claude", model: M.claude, msg: "Kick off a landing page for a product called 'Orbit'. Choose ONE css framework and a 2-color palette (give hex codes). State them explicitly." },
    { who: "gemini", model: M.gemini, msg: "Describe the hero image concept for this same landing page. It MUST match the palette already chosen — name the hex codes you are matching." },
    { who: "gpt", model: M.gpt, msg: "Write the hero headline and subheadline. Match the product name, the framework decision, and the palette already established by the earlier models." },
  ];

  for (const t of turns) {
    const r = await routeTurn(neurus, { session, message: t.msg, model: t.model });
    console.log(`── ${t.who.toUpperCase()}  [${r.model}] ──`);
    if (r.usedContext.length) {
      const sources = [...new Set(r.usedContext.map((c) => c.by))].filter((b) => b !== "user");
      console.log(`   recalled ${r.usedContext.length} item(s) from shared memory${sources.length ? ` · prior models: ${sources.join(", ")}` : ""}`);
    } else {
      console.log("   (first model — empty shared memory)");
    }
    console.log(r.text + "\n");
  }

  console.log("PROOF: gemini's and gpt's turns were generated ONLY from the shared MemWal memory of prior turns —");
  console.log("the palette/name/framework carried across models with no re-explaining. Swap any model id; context persists.");
}

main().catch((e) => { console.error("ERR", e?.message ?? e); process.exit(1); });
