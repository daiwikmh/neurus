import { SharedReplica } from "../src/crdt/replica";
import { Capabilities } from "../src/crdt/oplog";
import { createNeuron } from "../src/core/neuron";
import { sendTelegram } from "../src/notify";

try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

const BASE = process.env.NEURUS_API ?? "http://localhost:4318";
const SET = process.env.NET_SET ?? "defi";
const TICK_MS = Number(process.env.TICK_MS ?? 3000);
const REPORT_EVERY = Number(process.env.REPORT_EVERY ?? 3);
const MAX_TICKS = Number(process.env.TICKS ?? 0);
const THRESHOLD = Number(process.env.THRESHOLD ?? 0.5);
const SPIKE = process.argv.includes("--spike");

const FEEDS = [
  { slug: "aave", agent: "aave-feed", label: "Aave" },
  { slug: "uniswap", agent: "uniswap-feed", label: "Uniswap" },
  { slug: "lido", agent: "lido-feed", label: "Lido" },
];

const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (path: string) => fetch(`${BASE}${path}`).then((r) => r.json());

const fmtUsd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(0)}`);

async function tvl(slug: string): Promise<number | null> {
  try {
    const v = await fetch(`https://api.llama.fi/tvl/${slug}`).then((r) => r.json());
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function detectChatId(token?: string): Promise<string | undefined> {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  if (!token) return undefined;
  try {
    const u = await fetch(`https://api.telegram.org/bot${token}/getUpdates`).then((r) => r.json());
    const ids = (u.result ?? []).map((x: any) => x.message?.chat?.id).filter(Boolean);
    return ids.length ? String(ids[ids.length - 1]) : undefined;
  } catch {
    return undefined;
  }
}

interface Move {
  label: string;
  value: number;
  deltaPct: number;
  anomaly: boolean;
}

async function main() {
  const token = process.env.TELEGRAM_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = await detectChatId(token);
  console.log(`bot: token=${token ? "set" : "missing"} chatId=${chatId ?? "none (console-only)"}  set="${SET}" spike=${SPIKE}`);

  const replicas = new Map<string, SharedReplica>();
  for (const f of FEEDS) {
    const secret = `${f.agent}-secret`;
    await post("/v1/net/grant", { set: SET, actor: f.agent, secret });
    replicas.set(f.agent, new SharedReplica(f.agent, secret, new Capabilities()));
  }
  const analystSecret = "analyst-secret";
  await post("/v1/net/grant", { set: SET, actor: "analyst", secret: analystSecret });
  const analyst = new SharedReplica("analyst", analystSecret, new Capabilities());
  console.log(`granted ${FEEDS.length} feed-agents + analyst`);

  const last = new Map<string, number>();
  let tick = 0;
  let sinceReport: Move[] = [];

  const runTick = async () => {
    tick++;
    for (const f of FEEDS) {
      let v = await tvl(f.slug);
      if (v == null) {
        console.log(`  tick ${tick} ${f.agent}: fetch failed`);
        continue;
      }
      if (SPIKE && tick === 2 && f.slug === "aave") v = v * 1.07;
      const prev = last.get(f.slug);
      const deltaPct = prev ? ((v - prev) / prev) * 100 : 0;
      last.set(f.slug, v);
      const anomaly = !!prev && Math.abs(deltaPct) >= THRESHOLD;
      const body = `${f.label} TVL ${fmtUsd(v)}${prev ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}% vs prev)` : ""}${anomaly ? " [anomaly]" : ""}`;
      const op = replicas.get(f.agent)!.add(
        createNeuron({ type: "note", title: `${f.label} TVL`, body, author: f.agent, meta: { metric: f.slug, value: v, deltaPct, anomaly } }),
      );
      const r = await post("/v1/net/op", { set: SET, op });
      console.log(`  tick ${tick} ${f.agent}: ${body} -> ${r.ok ? "ok" : "REJECTED"}`);
      sinceReport.push({ label: f.label, value: v, deltaPct, anomaly });
    }

    if (tick % REPORT_EVERY === 0) {
      const notable = sinceReport.filter((o) => o.anomaly);
      if (notable.length === 0) {
        console.log(`analyst: nothing crossed ${THRESHOLD}% — staying quiet`);
      } else {
        const lines = notable
          .map((o) => `• ${o.label}: ${fmtUsd(o.value)} (${o.deltaPct >= 0 ? "+" : ""}${o.deltaPct.toFixed(2)}%)`)
          .join("\n");
        const report = `*DeFi report* — ${notable.length} notable move(s)\n${lines}`;
        const op = analyst.add(
          createNeuron({ type: "insight", title: `DeFi report (${notable.length})`, body: report, author: "analyst", meta: { importance: Math.min(1, 0.5 + notable.length * 0.2), report: true } }),
        );
        const r = await post("/v1/net/op", { set: SET, op });
        console.log(`analyst: report written -> ${r.ok ? "ok" : "REJECTED"}`);
        if (token && chatId) {
          try {
            await sendTelegram({ token, chatId }, report, { markdown: true });
            console.log("analyst: report delivered to Telegram");
          } catch (e: any) {
            console.log(`analyst: telegram failed: ${e?.message}`);
          }
        } else {
          console.log(`analyst: telegram skipped (no chat id)\n${report}`);
        }
      }
      sinceReport = [];
    }

    if (MAX_TICKS && tick >= MAX_TICKS) {
      const state = await get(`/v1/net/state?set=${SET}`);
      console.log(`\ndone: ${tick} ticks, state neurons=${state.neurons.length}, roster=[${state.roster.map((x: any) => x.actor).join(",")}]`);
      process.exit(0);
    }
  };

  await runTick();
  setInterval(() => {
    runTick().catch((e) => console.error(e));
  }, TICK_MS);
  if (!MAX_TICKS) console.log("running… ctrl-c to stop");
}

main();
