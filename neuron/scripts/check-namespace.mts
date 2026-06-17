import { localTenant, envCredentials } from "../src/identity/credentials.js";
import { listSets } from "../src/core/sets.js";
import { MemwalStore } from "../src/storage/memwal.js";

try { (process as any).loadEnvFile(".env.local"); } catch {}

const tenant = localTenant();
const creds = envCredentials();
const sets = await listSets(tenant);
const s = sets.find((s) => s.name === "walrus-docs");
console.log("walrus-docs namespace:", s?.namespace);

if (s && creds) {
  const store = new MemwalStore(s.namespace, creds);
  const r = await store.restore(50);
  console.log("restore with set namespace:", r);

  const store2 = new MemwalStore("default", creds);
  const r2 = await store2.restore(50);
  console.log("restore with 'default' namespace:", r2);
}
