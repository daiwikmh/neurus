try {
  process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
} catch {
  void 0;
}

import { price } from "../src/net/workflow";

const BASE = process.env.NEURUS_API ?? "http://localhost:4318";
const SET = `m3-${Date.now().toString(36)}`;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`);
  return json as any;
}

const close2 = (a: number, b: number, label: string) => {
  if (Math.abs(a - b) > 0.011) throw new Error(`FAIL ${label}: ${a} != ${b}`);
};

async function main() {
  const sui = await price("sui");
  if (sui == null) throw new Error("no SUI price");
  const entry = Number((sui / 1.1).toFixed(4));
  const stop = Number((sui * 0.85).toFixed(4));
  const target = Number((sui * 1.5).toFixed(4));
  console.log(`SUI now ${sui} | play: long entry=${entry} stop=${stop} target=${target}`);

  const logged = await call("POST", "/net/play", { set: SET, asset: "sui", direction: "long", entry, stop, target, thesis: "breakout continuation" });
  const playId = logged.play.id;
  console.log("logged play:", logged.play.body);

  const { plays } = await call("GET", `/net/plays?set=${SET}`);
  if (plays.length !== 1 || plays[0].status !== "open") throw new Error("FAIL: expected 1 open play");
  const row = plays[0];
  const expected = ((row.current - entry) / entry) * 100;
  close2(row.plPct, Number(expected.toFixed(2)), "live plPct");
  console.log(`list math OK: current=${row.current} plPct=${row.plPct}% distToStop=${row.distToStop}% distToTarget=${row.distToTarget}%`);

  await call("POST", "/net/workflow", { set: SET, assets: ["sui"], protocols: [], intervalMs: 60000, reportEvery: 1, durationDays: 1 });
  const rep = await call("POST", "/net/workflow/report", { set: SET });
  console.log("\n--- analyst report (grounded, with play) ---\n" + (rep.report ?? "(none)"));
  const state = await call("GET", `/net/state?set=${SET}`);
  const evals = state.neurons.filter((n: any) => n.meta?.kind === "evaluation" && n.meta?.playId === playId);
  if (!evals.length) throw new Error("FAIL: no evaluation neuron written");
  console.log("evaluation neuron:", evals[0].body);
  if (!rep.report || !rep.report.length) throw new Error("FAIL: empty report");

  const closedRes = await call("POST", "/net/play/close", { set: SET, playId });
  const cm = closedRes.closed.meta;
  const expPl = ((cm.exit - entry) / entry) * 100;
  close2(cm.plPct, Number(expPl.toFixed(2)), "closed plPct");
  console.log(`\nclosed: exit=${cm.exit} plPct=${cm.plPct}%`);
  console.log("post-mortem:", closedRes.postmortem.body);

  const after = await call("GET", `/net/plays?set=${SET}`);
  if (after.plays[0].status !== "closed") throw new Error("FAIL: play not closed in list");
  const pmInState = (await call("GET", `/net/state?set=${SET}`)).neurons.some((n: any) => n.meta?.kind === "postmortem" && n.meta?.playId === playId);
  if (!pmInState) throw new Error("FAIL: postmortem not in net state");

  await call("POST", "/net/workflow/stop", { set: SET });
  console.log("\nPASS");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
