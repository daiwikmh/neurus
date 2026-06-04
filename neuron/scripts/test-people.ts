import { Memory } from "../src/core/memory";
import { ingestNote } from "../src/ingest/note";
import { brief } from "../src/reason/brief";

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const NOTES = [
  "Met Sarah Chen at the Q2 offsite — she's the design lead, allergic to shellfish, prefers Tuesday afternoon calls. Tom Rivera introduced us.",
  "Call with Sarah Chen: she owns the design system deliverables. I promised her the updated pitch deck by Friday.",
  "Priya Nair leads backend and still owes me feedback on the data model spec.",
];

async function main() {
  const ns = `people_${Date.now().toString(36)}`;
  const mem = new Memory(ns, `.neurus-${ns}-manifest.json`);

  console.log("=== Drop: ingest notes (extract people, facts, commitments, intros) ===");
  for (const t of NOTES) {
    const r = await ingestNote(mem, t);
    console.log(`note "${t.slice(0, 46)}…" → people [${r.people.map((p) => p.title).join(", ")}] · commitments ${r.commitments.length}`);
  }

  console.log("\n=== Brief: pre-meeting card for Sarah Chen ===\n");
  const b = await brief(mem, "Sarah Chen");
  console.log(b.text);
  console.log(`\n(${b.sources} source neurons)`);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
