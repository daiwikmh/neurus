import { extractMeeting } from "../src/ingest/meeting";
try { process.loadEnvFile(".env.local"); } catch {}
async function main() {
  const a = await extractMeeting("Design review with Sarah this Friday at 3pm about the SUI dashboard");
  console.log("meeting:", JSON.stringify(a));
  const b = await extractMeeting("Sarah is allergic to shellfish and Tom introduced us");
  console.log("non-meeting:", JSON.stringify(b));
  console.log(a.isMeeting && !!a.start && b.isMeeting === false ? "OK" : "CHECK");
}
main().catch(e => { console.error("FAIL", e?.message ?? e); process.exit(1); });
