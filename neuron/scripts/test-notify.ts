import { rm } from "node:fs/promises";
import { connectTelegram, getNotifyConfig, notify } from "../src/notify";

const TMP = `.neurus-notify-test-${Date.now().toString(36)}.json`;
process.env.NEURUS_NOTIFY = TMP;
delete process.env.TELEGRAM_BOT_TOKEN;

const checks: [string, boolean][] = [];
const check = (name: string, cond: boolean) => checks.push([name, cond]);

async function main() {
  const empty = await getNotifyConfig();
  check("starts empty", !empty.telegram);

  const cfg = await connectTelegram("123456789");
  check("connect stores chatId", cfg.telegram?.chatId === "123456789");

  const reread = await getNotifyConfig();
  check("persists across reads", reread.telegram?.chatId === "123456789");

  const res = await notify("hello");
  check("no token → not delivered", res.delivered.length === 0);
  check("no token → skipped telegram", res.skipped.some((s) => s.startsWith("telegram")));

  await rm(TMP, { force: true });

  let ok = true;
  for (const [name, cond] of checks) {
    console.log(`  ${cond ? "✓" : "✗"} ${name}`);
    if (!cond) ok = false;
  }
  console.log(`\n=== ${ok ? "ALL PASS" : "FAILED"} (${checks.filter((c) => c[1]).length}/${checks.length}) ===`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("\n❌", e.message ?? e); process.exit(1); });
