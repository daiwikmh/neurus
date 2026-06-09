import { SharedReplica } from "../crdt/replica";
import { Capabilities } from "../crdt/oplog";
import { createNeuron } from "../core/neuron";
import { sendTelegram } from "../notify";
import { Neurus } from "../index";
import { chat } from "../llm/nvidia";
import type { Tenant } from "../identity/credentials";
import type { NetHub } from "./hub";

export interface WorkflowConfig {
  set: string;
  feeds: string[];
  assets: string[];
  intervalMs: number;
  threshold: number;
  reportEvery: number;
  strategySet?: string;
  instruction?: string;
  durationDays?: number;
  telegram?: { token: string; chatId: string };
  autoReport: boolean;
  tenant?: Tenant;
}

export interface WorkflowStatus {
  running: boolean;
  set: string;
  feeds: string[];
  assets: string[];
  intervalMs: number;
  threshold: number;
  strategySet?: string;
  instruction?: string;
  durationDays?: number;
  endsAt?: number;
  ticks: number;
  lastReport?: string;
}

interface Move {
  label: string;
  value: number;
  deltaPct: number;
  anomaly: boolean;
}

const fmtUsd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(0)}`);
const fmtPrice = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const REPORT_SYSTEM = `You are a monitoring analyst writing a short update for the user.
You are given the user's own STRATEGY notes and the CURRENT DATA you just collected.
Write a concise plain-text update (3-6 lines): what the data shows, whether it matters according to the strategy, and any action the strategy implies.
If the data does not trigger anything in the strategy, say so in one line. Do not invent numbers beyond the data given. No preamble.`;

async function tvl(slug: string): Promise<number | null> {
  try {
    const v = await fetch(`https://api.llama.fi/tvl/${slug}`).then((r) => r.json());
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function price(id: string): Promise<number | null> {
  try {
    const key = `coingecko:${id}`;
    const r: any = await fetch(`https://coins.llama.fi/prices/current/${key}`).then((r) => r.json());
    const p = r?.coins?.[key]?.price;
    return typeof p === "number" && Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

export class WorkflowRunner {
  private timer?: ReturnType<typeof setInterval>;
  private feedReplicas = new Map<string, SharedReplica>();
  private assetReplicas = new Map<string, SharedReplica>();
  private analyst: SharedReplica;
  private lastTvl = new Map<string, number>();
  private lastPrice = new Map<string, number>();
  private sinceReport: Move[] = [];
  private ticks = 0;
  private endsAt?: number;
  private lastReport?: string;

  constructor(private hub: NetHub, public cfg: WorkflowConfig) {
    for (const slug of cfg.feeds) {
      const agent = `${slug}-feed`;
      hub.grant(cfg.set, agent, `${agent}-secret`, "write");
      this.feedReplicas.set(slug, new SharedReplica(agent, `${agent}-secret`, new Capabilities()));
    }
    for (const id of cfg.assets) {
      const agent = `${id}-price`;
      hub.grant(cfg.set, agent, `${agent}-secret`, "write");
      this.assetReplicas.set(id, new SharedReplica(agent, `${agent}-secret`, new Capabilities()));
    }
    hub.grant(cfg.set, "analyst", "analyst-secret", "write");
    this.analyst = new SharedReplica("analyst", "analyst-secret", new Capabilities());
  }

  start(): void {
    if (this.timer) return;
    this.endsAt = Date.now() + (this.cfg.durationDays ?? 5) * 86_400_000;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.cfg.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  status(): WorkflowStatus {
    return {
      running: !!this.timer,
      set: this.cfg.set,
      feeds: this.cfg.feeds,
      assets: this.cfg.assets,
      intervalMs: this.cfg.intervalMs,
      threshold: this.cfg.threshold,
      strategySet: this.cfg.strategySet,
      instruction: this.cfg.instruction,
      durationDays: this.cfg.durationDays,
      endsAt: this.endsAt,
      ticks: this.ticks,
      lastReport: this.lastReport,
    };
  }

  private async recallStrategy(): Promise<string> {
    if (!this.cfg.strategySet) return "";
    try {
      const nx = await Neurus.open(this.cfg.strategySet, { tenant: this.cfg.tenant });
      const hits = await nx.recall(this.cfg.instruction || "strategy", { limit: 6 });
      return hits.map((h, i) => `[${i + 1}] ${h.neuron.body}`).join("\n");
    } catch {
      return "";
    }
  }

  private dataLines(): string[] {
    return [
      ...[...this.lastTvl.entries()].map(([slug, v]) => `${titleCase(slug)} TVL: ${fmtUsd(v)}`),
      ...[...this.lastPrice.entries()].map(([id, p]) => `${id.toUpperCase()} price: ${fmtPrice(p)}`),
    ];
  }

  private async groundedReport(): Promise<string | null> {
    const lines = this.dataLines();
    if (!lines.length) return null;
    const strategy = await this.recallStrategy();
    const user = `STRATEGY (the user's own notes):\n${strategy || "(none provided)"}\n\nCURRENT DATA:\n${lines.join("\n")}\n\nGOAL: ${this.cfg.instruction || "Give a short update on what changed and whether it matters."}`;
    try {
      return (await chat(REPORT_SYSTEM, user, { maxTokens: 400 })).trim();
    } catch {
      return `Update:\n${lines.join("\n")}`;
    }
  }

  async report(): Promise<{ sent: boolean; report?: string }> {
    const report = await this.groundedReport();
    if (!report) return { sent: false };
    this.lastReport = report;
    await this.hub.submit(this.cfg.set, this.analyst.add(createNeuron({ type: "insight", title: "Update", body: report, author: "analyst", meta: { report: true } })));
    if (this.cfg.telegram) {
      try {
        await sendTelegram(this.cfg.telegram, report, { markdown: true });
        return { sent: true, report };
      } catch {
        return { sent: false, report };
      }
    }
    return { sent: false, report };
  }

  private async tick(): Promise<void> {
    if (this.endsAt && Date.now() > this.endsAt) {
      this.stop();
      return;
    }
    this.ticks++;
    for (const slug of this.cfg.feeds) {
      const v = await tvl(slug);
      if (v == null) continue;
      const prev = this.lastTvl.get(slug);
      const deltaPct = prev ? ((v - prev) / prev) * 100 : 0;
      this.lastTvl.set(slug, v);
      const anomaly = !!prev && Math.abs(deltaPct) >= this.cfg.threshold;
      const body = `${titleCase(slug)} TVL ${fmtUsd(v)}${prev ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}% vs prev)` : ""}${anomaly ? " [anomaly]" : ""}`;
      await this.hub.submit(this.cfg.set, this.feedReplicas.get(slug)!.add(createNeuron({ type: "note", title: `${titleCase(slug)} TVL`, body, author: `${slug}-feed`, meta: { metric: slug, value: v, deltaPct, anomaly } })));
      this.sinceReport.push({ label: titleCase(slug), value: v, deltaPct, anomaly });
    }
    for (const id of this.cfg.assets) {
      const p = await price(id);
      if (p == null) continue;
      const prev = this.lastPrice.get(id);
      const deltaPct = prev ? ((p - prev) / prev) * 100 : 0;
      this.lastPrice.set(id, p);
      const anomaly = !!prev && Math.abs(deltaPct) >= this.cfg.threshold;
      const body = `${id.toUpperCase()} ${fmtPrice(p)}${prev ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}% vs prev)` : ""}${anomaly ? " [anomaly]" : ""}`;
      await this.hub.submit(this.cfg.set, this.assetReplicas.get(id)!.add(createNeuron({ type: "note", title: `${id.toUpperCase()} price`, body, author: `${id}-price`, meta: { asset: id, value: p, deltaPct, anomaly } })));
      this.sinceReport.push({ label: id.toUpperCase(), value: p, deltaPct, anomaly });
    }

    if (this.ticks % this.cfg.reportEvery === 0) {
      const notable = this.sinceReport.filter((m) => m.anomaly);
      this.sinceReport = [];
      const report = await this.groundedReport();
      if (report) {
        this.lastReport = report;
        await this.hub.submit(
          this.cfg.set,
          this.analyst.add(createNeuron({ type: "insight", title: "Update", body: report, author: "analyst", meta: { importance: Math.min(1, 0.5 + notable.length * 0.2), report: true } })),
        );
        if (this.cfg.telegram && this.cfg.autoReport) {
          try {
            await sendTelegram(this.cfg.telegram, report, { markdown: true });
          } catch {
            void 0;
          }
        }
      }
    }
  }
}
