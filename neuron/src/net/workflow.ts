import { SharedReplica } from "../crdt/replica";
import { Capabilities } from "../crdt/oplog";
import { createNeuron } from "../core/neuron";
import { sendTelegram } from "../notify";
import { Neurus } from "../index";
import { chat } from "../llm/nvidia";
import { fetchWalletState, describeWallet, shortAddr } from "./wallet";
import { playMath, describePlay, fmtPrice, type PlayMeta } from "./plays";
import { planConsolidation, describeTrend } from "./lifecycle";
import { resolveManagers, fetchManagerTrades, shortBm, type BalanceManagerRef } from "./deepbook";
import type { Tenant } from "../identity/credentials";
import type { NetHub } from "./hub";

export interface WorkflowConfig {
  set: string;
  feeds: string[];
  assets: string[];
  wallets: string[];
  deepbook?: boolean;
  deepbookManagers?: string[];
  intervalMs: number;
  threshold: number;
  epsilon: number;
  reportEvery: number;
  consolidateEvery?: number;
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
  wallets: string[];
  deepbook: boolean;
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

const fmtUsd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`);
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const REPORT_SYSTEM = `You are a monitoring analyst writing a short update for the user.
You are given the user's own STRATEGY notes, the CURRENT DATA you just collected, and the user's OPEN PLAYS with computed P&L.
Write a concise plain-text update (3-6 lines): what the data shows, whether it matters according to the strategy, and any action the strategy implies.
If OPEN PLAYS are listed, address each one: how it stands per the numbers given and what the strategy says to do. Never recompute or invent numbers — use the figures exactly as given.
If nothing triggers anything in the strategy, say so in one line. No preamble.`;

const BRIEF_SYSTEM = `You write a short daily brief for the user from the SECTIONS given (portfolio, open plays, trends, lessons, anomalies).
Keep it to a tight scannable digest (one line per item, group sensibly). Use the numbers exactly as given — never recompute or invent. Start with "Daily brief". No preamble.`;

async function tvl(slug: string): Promise<number | null> {
  try {
    const v = await fetch(`https://api.llama.fi/tvl/${slug}`).then((r) => r.json());
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function price(id: string): Promise<number | null> {
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
  private walletAgent?: SharedReplica;
  private analyst: SharedReplica;
  private consolidator: SharedReplica;
  private deepbookAgent?: SharedReplica;
  private managers?: BalanceManagerRef[];
  private lastTradeTs = new Map<string, number>();
  private lastTvl = new Map<string, number>();
  private lastPrice = new Map<string, number>();
  private lastWalletUsd = new Map<string, number>();
  private lastWalletLine = new Map<string, string>();
  private recentTrades: string[] = [];
  private sinceReport: Move[] = [];
  private ticks = 0;
  private endsAt?: number;
  private lastReport?: string;
  private lastBriefDate?: string;

  constructor(private hub: NetHub, public cfg: WorkflowConfig, resume?: { ticks: number; endsAt: number }) {
    for (const slug of cfg.feeds) this.feedReplicas.set(slug, this.grantReplica(`${slug}-feed`));
    for (const id of cfg.assets) this.assetReplicas.set(id, this.grantReplica(`${id}-price`));
    if (cfg.wallets.length) this.walletAgent = this.grantReplica("wallet-agent");
    if (cfg.deepbook || cfg.deepbookManagers?.length) this.deepbookAgent = this.grantReplica("deepbook-agent");
    this.analyst = this.grantReplica("analyst");
    this.consolidator = this.grantReplica("consolidator");
    if (resume) {
      this.ticks = resume.ticks;
      this.endsAt = resume.endsAt;
    }
  }

  private grantReplica(agent: string): SharedReplica {
    this.hub.grant(this.cfg.set, agent, `${agent}-secret`, "write");
    return new SharedReplica(agent, `${agent}-secret`, new Capabilities());
  }

  private deltaOf(prev: number | undefined, v: number): { deltaPct: number; anomaly: boolean } {
    const deltaPct = prev ? ((v - prev) / prev) * 100 : 0;
    return { deltaPct, anomaly: !!prev && Math.abs(deltaPct) >= this.cfg.threshold };
  }

  private deltaSuffix(prev: number | undefined, deltaPct: number, anomaly: boolean): string {
    return `${prev !== undefined ? ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}% vs prev)` : ""}${anomaly ? " [anomaly]" : ""}`;
  }

  private async submitNote(replica: SharedReplica, author: string, title: string, body: string, meta: Record<string, unknown>): Promise<void> {
    await this.hub.submit(this.cfg.set, replica.add(createNeuron({ type: "note", title, body, author, meta })));
  }

  start(): void {
    if (this.timer) return;
    this.endsAt = this.endsAt ?? Date.now() + (this.cfg.durationDays ?? 5) * 86_400_000;
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
      wallets: this.cfg.wallets,
      deepbook: !!(this.cfg.deepbook || this.cfg.deepbookManagers?.length),
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
      ...[...this.lastWalletLine.entries()].map(([addr, line]) => `Wallet ${shortAddr(addr)}: ${line}`),
      ...(this.recentTrades.length ? [`Recent DeepBook fills: ${this.recentTrades.join("; ")}`] : []),
    ];
  }

  private async pollDeepbook(): Promise<void> {
    if (!this.deepbookAgent) return;
    if (!this.managers) this.managers = await resolveManagers(this.cfg.wallets, this.cfg.deepbookManagers ?? []);
    if (!this.managers.length) return;
    const seen = new Set(this.hub.snapshot(this.cfg.set).neurons.map((n) => (n.meta as Record<string, unknown> | undefined)?.tradeId).filter(Boolean) as string[]);
    const fresh: string[] = [];
    for (const m of this.managers) {
      const since = this.lastTradeTs.get(m.id) ?? Date.now() - 86_400_000;
      let trades = await fetchManagerTrades(m.id, since);
      if (this.lastTradeTs.get(m.id) === undefined) trades = trades.slice(-30);
      for (const t of trades) {
        this.lastTradeTs.set(m.id, Math.max(this.lastTradeTs.get(m.id) ?? 0, t.ts));
        if (seen.has(t.tradeId)) continue;
        seen.add(t.tradeId);
        const line = `${t.pair} ${t.side} ${t.qty} @ ${fmtPrice(t.price)} (${t.role})`;
        await this.submitNote(this.deepbookAgent, "deepbook-agent", `Trade: ${t.pair} ${t.side}`, line, {
          kind: "trade",
          tradeId: t.tradeId,
          manager: m.id,
          pool: t.pool,
          pair: t.pair,
          side: t.side,
          role: t.role,
          qty: t.qty,
          price: t.price,
          quoteQty: t.quoteQty,
          ts: t.ts,
        });
        fresh.push(line);
      }
    }
    if (fresh.length) this.recentTrades = fresh.slice(-5);
  }

  private openPlays(): { id: string; meta: PlayMeta }[] {
    return this.hub
      .snapshot(this.cfg.set)
      .neurons.filter((n) => (n.meta as Record<string, unknown> | undefined)?.kind === "play" && (n.meta as Record<string, unknown>).status === "open")
      .map((n) => ({ id: n.id, meta: n.meta as unknown as PlayMeta }));
  }

  private async evaluatePlays(): Promise<string[]> {
    const lines: string[] = [];
    for (const { id, meta } of this.openPlays()) {
      const current = this.lastPrice.get(meta.asset) ?? (await price(meta.asset));
      if (current == null) continue;
      const m = playMath(meta, current);
      const body = describePlay(meta, current, m);
      await this.submitNote(this.analyst, "analyst", `Eval: ${meta.asset.toUpperCase()} ${meta.direction}`, body, {
        kind: "evaluation",
        playId: id,
        price: current,
        plPct: m.plPct,
        distToStop: m.distToStop,
        distToTarget: m.distToTarget,
        hitStop: m.hitStop,
        hitTarget: m.hitTarget,
      });
      lines.push(body);
    }
    return lines;
  }

  private async groundedReport(): Promise<string | null> {
    const lines = this.dataLines();
    const playLines = await this.evaluatePlays();
    if (!lines.length && !playLines.length) return null;
    const strategy = await this.recallStrategy();
    const plays = playLines.length ? `\n\nOPEN PLAYS (computed):\n${playLines.join("\n")}` : "";
    const user = `STRATEGY (the user's own notes):\n${strategy || "(none provided)"}\n\nCURRENT DATA:\n${lines.join("\n")}${plays}\n\nGOAL: ${this.cfg.instruction || "Give a short update on what changed and whether it matters."}`;
    try {
      return (await chat(REPORT_SYSTEM, user, { maxTokens: 400 })).trim();
    } catch {
      return `Update:\n${[...lines, ...playLines].join("\n")}`;
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

  async consolidate(): Promise<number> {
    const snap = this.hub.snapshot(this.cfg.set);
    const plan = planConsolidation(snap.neurons);
    if (!plan.trends.length) return 0;
    this.consolidator.receive(this.hub.opsSince(this.cfg.set, 0));
    let folded = 0;
    for (const { stats, consolidatedIds } of plan.trends) {
      await this.hub.submit(
        this.cfg.set,
        this.consolidator.add(createNeuron({ type: "insight", title: `Trend: ${stats.label}`, body: describeTrend(stats), author: "consolidator", meta: { kind: "trend", replacedCount: consolidatedIds.length, ...stats } })),
      );
      for (const id of consolidatedIds) {
        for (const op of this.consolidator.remove(id)) await this.hub.submit(this.cfg.set, op);
        folded++;
      }
    }
    return folded;
  }

  private dayKey(ts = Date.now()): string {
    return new Date(ts).toISOString().slice(0, 10);
  }

  private briefSections(): string[] {
    const dayAgo = Date.now() - 86_400_000;
    const snap = this.hub.snapshot(this.cfg.set).neurons;
    const meta = (n: (typeof snap)[number]) => (n.meta ?? {}) as Record<string, unknown>;
    const sections: string[] = [];

    for (const addr of this.cfg.wallets) {
      const snaps = snap.filter((n) => meta(n).kind === "portfolio_snapshot" && meta(n).address === addr).sort((a, b) => a.createdAt - b.createdAt);
      if (!snaps.length) continue;
      const latest = meta(snaps[snaps.length - 1]).totalUsd as number;
      const dayStart = snaps.find((n) => n.createdAt >= dayAgo);
      const prev = dayStart ? (meta(dayStart).totalUsd as number) : undefined;
      const delta = prev ? ((latest - prev) / prev) * 100 : null;
      sections.push(`Portfolio ${shortAddr(addr)}: ${fmtUsd(latest)}${delta != null ? ` (${delta >= 0 ? "+" : ""}${delta.toFixed(2)}% 24h)` : ""}`);
    }

    for (const { meta: p } of this.openPlays()) {
      const cur = this.lastPrice.get(p.asset);
      if (cur == null) sections.push(`Play ${p.asset.toUpperCase()} ${p.direction} @ ${fmtPrice(p.entry)} (open)`);
      else sections.push(`Play ${describePlay(p, cur, playMath(p, cur))}`);
    }

    for (const t of snap.filter((n) => meta(n).kind === "trend" && n.createdAt >= dayAgo)) {
      const d = Number(meta(t).deltaPct) || 0;
      sections.push(`Trend ${meta(t).label}: ${d >= 0 ? "+" : ""}${d.toFixed(2)}% net`);
    }
    for (const pm of snap.filter((n) => meta(n).kind === "postmortem" && n.createdAt >= dayAgo)) {
      sections.push(`Lesson: ${pm.body}`);
    }
    const anomalies = snap.filter((n) => meta(n).anomaly === true && n.createdAt >= dayAgo).length;
    if (anomalies) sections.push(`${anomalies} anomaly flag(s) in the last 24h`);
    return sections;
  }

  async dailyBrief(): Promise<{ sent: boolean; brief?: string; date: string }> {
    const date = this.dayKey();
    const sections = this.briefSections();
    if (!sections.length) return { sent: false, date };
    const digest = sections.map((s) => `• ${s}`).join("\n");
    let body = `*Daily brief — ${date}*\n${digest}`;
    try {
      const phrased = (await chat(BRIEF_SYSTEM, `Sections:\n${digest}\n\nFocus: ${this.cfg.instruction ?? "general monitoring"}`, { maxTokens: 300 })).trim();
      if (phrased) body = phrased;
    } catch {
      void 0;
    }
    this.lastBriefDate = date;
    await this.hub.submit(this.cfg.set, this.analyst.add(createNeuron({ type: "insight", title: `Daily brief ${date}`, body, author: "analyst", meta: { kind: "brief", date } })));
    if (this.cfg.telegram) {
      try {
        await sendTelegram(this.cfg.telegram, body, { markdown: true });
        return { sent: true, brief: body, date };
      } catch {
        return { sent: false, brief: body, date };
      }
    }
    return { sent: false, brief: body, date };
  }

  async maybeDailyBrief(): Promise<boolean> {
    const today = this.dayKey();
    const already = this.lastBriefDate === today || this.hub.snapshot(this.cfg.set).neurons.some((n) => (n.meta as Record<string, unknown> | undefined)?.kind === "brief" && (n.meta as Record<string, unknown>).date === today);
    if (already) return false;
    return (await this.dailyBrief()).brief != null;
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
      const { deltaPct, anomaly } = this.deltaOf(prev, v);
      this.lastTvl.set(slug, v);
      const body = `${titleCase(slug)} TVL ${fmtUsd(v)}${this.deltaSuffix(prev, deltaPct, anomaly)}`;
      await this.submitNote(this.feedReplicas.get(slug)!, `${slug}-feed`, `${titleCase(slug)} TVL`, body, { metric: slug, value: v, deltaPct, anomaly });
      this.sinceReport.push({ label: titleCase(slug), value: v, deltaPct, anomaly });
    }
    for (const id of this.cfg.assets) {
      const p = await price(id);
      if (p == null) continue;
      const prev = this.lastPrice.get(id);
      const { deltaPct, anomaly } = this.deltaOf(prev, p);
      this.lastPrice.set(id, p);
      const body = `${id.toUpperCase()} ${fmtPrice(p)}${this.deltaSuffix(prev, deltaPct, anomaly)}`;
      await this.submitNote(this.assetReplicas.get(id)!, `${id}-price`, `${id.toUpperCase()} price`, body, { asset: id, value: p, deltaPct, anomaly });
      this.sinceReport.push({ label: id.toUpperCase(), value: p, deltaPct, anomaly });
    }
    for (const addr of this.cfg.wallets) {
      try {
        const w = await fetchWalletState(addr);
        this.lastWalletLine.set(addr, describeWallet(w));
        const prev = this.lastWalletUsd.get(addr);
        const { deltaPct, anomaly } = this.deltaOf(prev, w.totalUsd);
        if (prev !== undefined && Math.abs(deltaPct) < this.cfg.epsilon) continue;
        this.lastWalletUsd.set(addr, w.totalUsd);
        const body = `${describeWallet(w)}${this.deltaSuffix(prev, deltaPct, anomaly)}`;
        await this.submitNote(this.walletAgent!, "wallet-agent", `Wallet ${shortAddr(addr)}`, body, {
          kind: "portfolio_snapshot",
          address: addr,
          totalUsd: w.totalUsd,
          holdings: w.holdings.map((h) => ({ coin: h.symbol, amount: h.amount, usd: h.usd })),
          deltaPct,
          anomaly,
        });
        if (prev !== undefined) this.sinceReport.push({ label: `wallet ${shortAddr(addr)}`, value: w.totalUsd, deltaPct, anomaly });
      } catch {
        continue;
      }
    }
    try {
      await this.pollDeepbook();
    } catch {
      void 0;
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

    const every = this.cfg.consolidateEvery ?? 20;
    if (every > 0 && this.ticks % every === 0) {
      try {
        await this.consolidate();
      } catch {
        void 0;
      }
    }

    if (this.ticks > 1) {
      try {
        await this.maybeDailyBrief();
      } catch {
        void 0;
      }
    }
  }
}
