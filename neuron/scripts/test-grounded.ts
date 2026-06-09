try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { NetHub } from "../src/net/hub";
import { WorkflowRunner } from "../src/net/workflow";

async function main() {
  const hub = new NetHub();
  const runner = new WorkflowRunner(hub, {
    set: "wftest-grounded",
    feeds: ["aave"],
    assets: ["sui"],
    intervalMs: 4000,
    threshold: 0.5,
    reportEvery: 99,
    strategySet: "default",
    instruction: "Tell me if SUI price action is relevant to anything in my notes.",
    durationDays: 1,
    autoReport: false,
  });

  runner.start();
  await new Promise((r) => setTimeout(r, 5000));
  console.log("populated one tick, composing grounded report (recall + LLM)...");
  const r = await runner.report();
  runner.stop();

  const status = runner.status();
  console.log("ticks:", status.ticks, "| durationDays:", status.durationDays);
  console.log("\n--- grounded report ---\n");
  console.log(r.report ?? "(no report)");
  console.log("\n--- network neurons ---");
  console.log(hub.snapshot("wftest-grounded").neurons.map((n: any) => `${n.source.author}: ${n.title}`).join("\n"));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
