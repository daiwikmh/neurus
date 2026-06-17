import { MemwalStore } from "../src/storage/memwal.js";
import { envCredentials } from "../src/identity/credentials.js";

try { (process as any).loadEnvFile(".env.local"); } catch {}

const creds = envCredentials();
if (!creds) { console.error("No credentials"); process.exit(1); }

const store = new MemwalStore("default", creds);

const texts = [
  `bulk test A — ${Date.now()}`,
  `bulk test B — ${Date.now()}`,
  `bulk test C — ${Date.now()}`,
];

console.log("Testing rememberBulk with", texts.length, "items...");
console.time("rememberBulk");
const blobIds = await store.rememberBulk(texts, 60_000);
console.timeEnd("rememberBulk");
console.log("blob IDs:", blobIds);
console.log("all succeeded:", blobIds.every(Boolean));

console.log("\nTesting restore(10)...");
const r = await store.restore(10);
console.log("restore result:", r);
