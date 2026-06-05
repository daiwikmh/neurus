import { rm } from "node:fs/promises";
import { createWidget, listWidgets, getWidget, deleteWidget } from "../src/core/widgets";
import type { Tenant } from "../src/identity/credentials";

const TMP = `.neurus-widgets-test-${Date.now().toString(36)}.json`;
process.env.NEURUS_WIDGETS = TMP;

const alice: Tenant = { id: "alice", root: ".x" };
const bob: Tenant = { id: "bob", root: ".y" };

const checks: [string, boolean][] = [];
const check = (n: string, c: boolean) => checks.push([n, c]);

async function main() {
  const w = await createWidget(alice, "set_docs", "Docs Bot", ["https://example.com"]);
  check("public unguessable id", w.id.startsWith("wgt_") && w.id.length > 16);
  check("bound to tenant + set", w.tenantId === "alice" && w.set === "set_docs");

  check("owner sees own widget", (await listWidgets(alice)).length === 1);
  check("other tenant isolated", (await listWidgets(bob)).length === 0);
  check("set filter", (await listWidgets(alice, "set_docs")).length === 1 && (await listWidgets(alice, "other")).length === 0);

  check("public getWidget resolves cross-tenant (no auth)", (await getWidget(w.id))?.set === "set_docs");
  check("origins persisted", (await getWidget(w.id))?.origins[0] === "https://example.com");

  check("foreign tenant cannot delete", (await deleteWidget(w.id, bob)) === false);
  check("owner deletes", (await deleteWidget(w.id, alice)) === true);
  check("gone after delete", (await getWidget(w.id)) === undefined);

  await rm(TMP, { force: true });
  let ok = true;
  for (const [n, c] of checks) { console.log(`  ${c ? "✓" : "✗"} ${n}`); if (!c) ok = false; }
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
