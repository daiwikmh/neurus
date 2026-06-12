import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "bin/mcp.ts"] });
  const client = new Client({ name: "neurus-test", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));

  const ls = await client.callTool({ name: "list_sets", arguments: {} });
  const first = (ls.content as any[])[0];
  console.log("list_sets ->", String(first.text).split("\n").slice(0, 3).join(" | "), "…");

  const rc = await client.callTool({ name: "recall", arguments: { query: "what do I owe", set: "default", limit: 2 } });
  console.log("recall ->", String((rc.content as any[])[0].text).slice(0, 120).replace(/\n/g, " "), "…");

  await client.close();
  console.log("OK");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
