// Register or inspect the Telegram webhook for the Neurus bot.
//
//   npx tsx scripts/set-webhook.ts                       # show current webhook info
//   npx tsx scripts/set-webhook.ts https://app.railway.app   # set webhook to <url>/v1/telegram/webhook
//   npx tsx scripts/set-webhook.ts --delete              # remove the webhook
//
// Reads TELEGRAM_BOT_TOKEN (or TELEGRAM_TOKEN) and optional TELEGRAM_WEBHOOK_SECRET from .env.local.

try { process.loadEnvFile(".env.local"); } catch { /* noop */ }

const token = process.env.TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN (or TELEGRAM_TOKEN) in env.");
  process.exit(1);
}

const api = (method: string, params: Record<string, string> = {}) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => r.json() as Promise<any>);

async function info() {
  const r = await api("getWebhookInfo");
  const w = r.result ?? {};
  console.log("Current webhook:");
  console.log("  url:", w.url || "(none)");
  console.log("  pending updates:", w.pending_update_count ?? 0);
  if (w.last_error_message) console.log("  last error:", w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : "", w.last_error_message);
}

async function main() {
  const arg = process.argv[2];

  if (arg === "--delete") {
    const r = await api("deleteWebhook", { drop_pending_updates: "true" });
    console.log(r.ok ? "Webhook deleted." : `Failed: ${r.description}`);
    return;
  }

  if (!arg) {
    await info();
    console.log("\nTo set it:  npx tsx scripts/set-webhook.ts https://<your-app>.railway.app");
    return;
  }

  const base = arg.replace(/\/+$/, "");
  const url = `${base}/v1/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const params: Record<string, string> = { url, allowed_updates: JSON.stringify(["message", "edited_message"]) };
  if (secret) params.secret_token = secret;

  const r = await api("setWebhook", params);
  if (!r.ok) {
    console.error(`setWebhook failed: ${r.description}`);
    process.exit(1);
  }
  console.log(`Webhook set → ${url}${secret ? " (with secret)" : ""}`);
  console.log();
  await info();
}

main().catch((e) => { console.error("\nerror:", e?.message ?? e); process.exit(1); });
