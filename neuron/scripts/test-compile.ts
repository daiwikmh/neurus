try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { compileWorkflow } from "../src/net/compile";
import { listSets } from "../src/index";

async function main() {
  const sets = (await listSets()).map((s) => s.name);
  console.log("available sets:", sets);

  const prompt = process.argv.slice(2).join(" ") || "For the next 5 days send me Telegram updates based on the strategy I uploaded and the asset SUI, check every minute";
  console.log("\nprompt:", prompt);

  const spec = await compileWorkflow(prompt, { sets });
  console.log("\ncompiled spec:");
  console.log(JSON.stringify(spec, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
