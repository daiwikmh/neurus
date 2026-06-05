import { withRetry, RetryableError, isNetworkError } from "../src/util/retry";

const checks: [string, boolean][] = [];
const check = (name: string, cond: boolean) => checks.push([name, cond]);

async function main() {
  let calls = 0;
  const value = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new RetryableError("transient");
    return "ok";
  }, { baseMs: 1, attempts: 5 });
  check("retries transient then succeeds", value === "ok" && calls === 3);

  let nonRetryCalls = 0;
  let threw = false;
  try {
    await withRetry(async () => {
      nonRetryCalls++;
      throw new Error("NVIDIA API HTTP 401: bad key");
    }, { baseMs: 1, attempts: 5, shouldRetry: (e) => e instanceof RetryableError });
  } catch {
    threw = true;
  }
  check("non-retryable (401) fails immediately, 1 call", threw && nonRetryCalls === 1);

  let exhaustCalls = 0;
  let exhausted = false;
  try {
    await withRetry(async () => {
      exhaustCalls++;
      throw new RetryableError("always");
    }, { baseMs: 1, attempts: 3 });
  } catch (e) {
    exhausted = (e as Error).message.includes("failed after retries");
  }
  check("exhausts attempts then throws labeled error", exhausted && exhaustCalls === 3);

  check("classifies 'fetch failed' as network", isNetworkError(new Error("fetch failed")));
  check("classifies AbortError as network", isNetworkError(Object.assign(new Error("x"), { name: "AbortError" })));
  check("classifies ECONNRESET cause as network", isNetworkError(Object.assign(new Error("boom"), { cause: { code: "ECONNRESET" } })));
  check("does NOT treat 401 as network", !isNetworkError(new Error("NVIDIA API HTTP 401: bad key")));

  let ok = true;
  for (const [name, cond] of checks) {
    console.log(`  ${cond ? "✓" : "✗"} ${name}`);
    if (!cond) ok = false;
  }
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
