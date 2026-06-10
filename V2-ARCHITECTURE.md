# Neurus V2 — Architecture Design

Status: DESIGN. Locked 2026-06-10. Implementation milestones M1–M7 at the bottom; the economy layer is design-only and explicitly not built in v2.

## Thesis

V1 proved the substrate: a permissioned agent network writing signed ops into shared CRDT memory persisted on Walrus, driven by prompt-compiled workflows. V2 turns that substrate into a single-player product: **agents read your on-chain reality (wallet, DeepBook orders) and the market, evaluate your positions against your own strategy, consolidate what they see into durable trends, grade their own calls against outcomes, and let you ask the whole memory anything.**

Platform tagline: "One memory for all your agents — fed by your data, owned by you."
Vertical headline (landing section, not brand): "Agents that watch your wallet and grade your trades."

Sequencing rationale (assessed 2026-06-10): marketplaces and data-sales fail without single-player traction; the economy layer is designed here so nothing in v2 has to be rewritten for it, but none of it ships in v2.

## Layer map

```
┌─────────────────────────────────────────────────────────────┐
│ UI (src/app/dashboard/network)                              │
│  prompt box · canvas · plays panel · Ask box · op feed      │
├─────────────────────────────────────────────────────────────┤
│ Read layer                                                  │
│  POST /v1/net/ask  — recall over net_{set} → live-state     │
│  filter → rerank → cited answer                             │
├─────────────────────────────────────────────────────────────┤
│ Cognition layer (in-workflow agents)                        │
│  evaluator (plays vs strategy, deterministic math)          │
│  consolidator (trends + prune)                              │
│  reflexion (post-mortems on play close)                     │
│  brief (daily digest)                                       │
├─────────────────────────────────────────────────────────────┤
│ Workflow engine v2                                          │
│  WorkflowRecord (durable, Walrus) · stateless tick ·        │
│  cursor resume · compile (NL → spec)                        │
├─────────────────────────────────────────────────────────────┤
│ Data sources (read-only, no keys, no custody)               │
│  wallet (Sui balances) · deepbook (orders/fills) ·          │
│  DefiLlama TVL · DefiLlama coins prices                     │
├─────────────────────────────────────────────────────────────┤
│ Substrate (v1, unchanged)                                   │
│  NetHub CRDT (signed ops, caps, merkle) · Walrus persist ·  │
│  MemWal embed/recall · rerank · answer                      │
└─────────────────────────────────────────────────────────────┘
```

Everything new writes through the existing signed-op path (`hub.submit`), so wallet snapshots, trades, plays, evaluations, and trends automatically appear in the graph, the live op feed, and the merkle root with no new plumbing.

## 1. Neuron taxonomy

No schema change. All v2 records are standard `Neuron`s discriminated by `meta.kind`:

| meta.kind | author | written when | meta payload |
|---|---|---|---|
| `portfolio_snapshot` | `wallet-agent` | tick, only if totalUsd moved >= epsilon | `{address, totalUsd, holdings:[{coin, amount, usd}], deltaPct}` |
| `trade` | `deepbook-agent` | backfill + new fills | `{pool, pair, side, qty, price, ts, eventId}` |
| `open_order` | `deepbook-agent` | open-order set changed | `{pool, pair, side, qty, price, orderId}` |
| `play` | `self` (owner) | "Log a play" form | `{asset, direction, entry, target, stop, status: open\|closed, thesis, closedAt?, exit?}` |
| `evaluation` | `analyst` | every E ticks per open play | `{playId, price, plPct, distToStop, distToTarget, verdict}` |
| `postmortem` | `analyst` | play closes | `{playId, entry, exit, plPct, ruleFollowed: boolean, lesson}` |
| `trend` | `consolidator` | every C ticks per metric | `{metric, window, min, max, mean, deltaPct, anomalies, replacedCount}` |
| `brief` | `analyst` | daily | `{date, sections}` |

Existing kinds (`note` observations from feeds/prices, `insight` reports) unchanged.

Dedup keys: `trade.eventId` (DeepBook event id), `portfolio_snapshot` epsilon gate, `trend` replaces its raws. Idempotency rule everywhere: deterministic neuron ids derived from `(workflowId, tickIndex, kind, key)` so a retried tick re-submits the same op and the CRDT merge no-ops.

## 2. Data sources

### 2.1 `neuron/src/net/wallet.ts` (M1)
- `fetchWalletState(address)`: `@mysten/sui` `SuiClient.getAllBalances(address)` → coin types/amounts; USD priced via `coins.llama.fi/prices/current/...` (same client pattern as the v1 asset feed).
- Read-only. Wallet = pasted address. No signing, no keys, no custody. Any address works (yours, a whale's, a fund's) — this is a feature, not a compromise.
- Anti-bloat at the source: write `portfolio_snapshot` only when `|deltaPct| >= epsilon` (default 0.5%) or first tick.

### 2.2 `neuron/src/net/deepbook.ts` (M4)
- Discovery: owned-object query on the address for DeepBook v3 `BalanceManager` objects.
- Fills: `OrderFilled` events where maker/taker balance manager matches — via `suix_queryEvents`, falling back to Mysten's hosted DeepBook indexer if event pagination proves unreliable (decide at build time; `@mysten/deepbook-v3` SDK for typed calls).
- Backfill on first attach (capped, newest-first), then incremental per tick from a stored event cursor. Dedup by `eventId`.
- Open orders: `account_open_orders` per pool the user has traded → `open_order` neurons replaced on change.
- Honest scope: DeepBook-routed flow only. CEX history and AMM swap parsing are out of v2.

### 2.3 Existing feeds (unchanged)
DefiLlama TVL (`api.llama.fi/tvl/{slug}`) and asset prices (`coins.llama.fi`). All sources share the failure policy: a failed fetch skips the metric for that tick, never aborts the tick.

## 3. Workflow engine v2

### 3.1 The split
- Control plane = `WorkflowRecord`, durable.
- Data plane = `runTick(record)`, stateless and idempotent.

```ts
WorkflowRecord {
  id: string                      // wf_{12hex}
  set: string
  spec: {
    strategySet?: string
    assets: string[]
    protocols: string[]
    wallets: string[]             // NEW (M1)
    deepbook: boolean             // NEW (M4)
    intervalMs: number
    durationDays: number
    instruction: string
    telegram: boolean
    epsilon: number               // snapshot gate
    evaluateEvery: number         // ticks (E)
    consolidateEvery: number      // ticks (C)
  }
  cursor: {
    ticksDone: number
    lastTickAt: number
    deepbookEventCursor?: string
    lastConsolidatedAt?: number
    lastBriefDate?: string
  }
  paid?: { ticket: string; amountWal: number; expiresAt: number }   // economy seam, unused in v2
  startedAt: number
  endsAt: number
  status: "active" | "expired" | "stopped"
}
```

### 3.2 Persistence and resume (M5) — Tier 1.5
- Records persisted exactly like net state: sealed with `NEURON_VAULT_KEY` → Walrus blob → pointer in `.neurus-workflows.json` (mirrors `net/persist.ts`). Checkpoint on every record mutation plus the 15s interval already in place for net state.
- `boot()` (in `server.ts`): after `net.restore()`, load records; for each `active` record with `endsAt > now`, resume its driver. Resume from cursor — compute `nextRunAt = lastTickAt + intervalMs`; do not fire catch-up ticks for downtime.
- Driver in v2 stays `setInterval` per record (Tier 1.5). The record/cursor shape is the contract; swapping the driver for BullMQ / Inngest / Durable Objects (Tier 2) later changes no tick logic.

### 3.3 The tick (stateless)
```
runTick(record):
  if now > endsAt: status=expired, final brief, stop
  gather:    prices, tvl, wallet snapshots (epsilon-gated), deepbook fills since cursor
  write:     observation neurons (deterministic ids) via hub.submit
  evaluate:  if ticksDone % evaluateEvery == 0 → evaluator over open plays
  consolidate: if ticksDone % consolidateEvery == 0 → consolidator
  brief:     if date rolled over and telegram → daily brief
  cursor++, persist record
```
All LLM steps are best-effort with deterministic fallbacks; a tick never fails because the model did.

### 3.4 Compiler (`net/compile.ts`, extended)
`WorkflowSpec` gains `wallets: string[]` (Sui addresses parsed from the prompt or attached via UI), `deepbook: boolean`, `epsilon`, `evaluateEvery`, `consolidateEvery` (defaulted, prompt-overridable). The system prompt gains mapping rules: "my wallet 0x… " → wallets; "my orders/trades" → deepbook:true.

## 4. Cognition layer

Design rule for everything in this layer: **numbers are computed in code; the LLM only phrases.** gpt-oss-120b is not trusted with arithmetic or with deciding what to delete.

### 4.1 Evaluator (M3)
Inputs per cycle: open `play` neurons + latest price/snapshot per asset + strategy recall (`Neurus.open(strategySet).recall(play.thesis)`).
Deterministic core computed in code: `plPct`, `distToStop`, `distToTarget`, rule triggers (e.g. stop within threshold). LLM composes the verdict sentence from those numbers + strategy passages. Output: `evaluation` neuron + Telegram line when a rule triggers.

### 4.2 Reflexion post-mortem (M3)
On `play/close`: code computes entry/exit/plPct and whether the logged stop/target was respected; LLM writes a one-paragraph `postmortem` with a lesson. Post-mortems are recalled by the evaluator on future plays for the same asset ("you've been stopped out of SUI breakouts twice").

### 4.3 Consolidator (M6) — `neuron/src/net/lifecycle.ts`
Every C ticks, per metric (asset price, protocol TVL, wallet total):
1. Collect raw observation neurons older than the active window.
2. Compute stats deterministically: min/max/mean/delta/anomaly count/streaks.
3. Write one `trend` neuron carrying the stats (LLM optionally phrases the body).
4. Remove the consolidated raws via CRDT remove ops (observed-remove tombstones — the designed prune path). Never remove: anomaly-flagged neurons, anything referenced by an `evaluation`/`postmortem`, anything younger than the window.
5. Trends themselves consolidate into longer-window trends on a slower cadence (day → week).

Effect: a 5-day, 1-minute workflow ends at ~dozens of trends + the full decision journal instead of 7,200 raws. Decay tiers map onto storage: hot neurons in MemWal; pruned raws are simply gone (their MemWal embeddings are orphaned — see 5.2); a cold Quilt archive tier is deferred until volume justifies it.

### 4.4 Daily brief (M7)
Once per day-rollover: portfolio delta since yesterday, open-play status table, new trends, post-mortem lessons, anything anomalous. One Telegram message, composed from neurons already in the set — no new data fetches.

## 5. Read layer — Ask the Network (M2)

### 5.1 `POST /v1/net/ask {set, question}`
1. `MemwalStore("net_" + setId).recall(question, 24)` — the namespace every net neuron already embeds into (`server.ts` index hook).
2. **Filter hits to ids present in current CRDT state** (`net.snapshot(set)`); drop hits whose neuron was pruned/removed.
3. Rerank survivors with the existing cross-encoder; feed `answer()`.
4. Response includes per-source attribution (author + age): "per wallet-agent, 2h ago".
SSE streaming variant mirrors `/v1/ask/stream`.

### 5.2 Drift policy
Pruned neurons keep stale embeddings in MemWal (no delete API in the managed flow). The live-state filter at query time makes them invisible; cost is recall-slot waste, bounded by consolidation cadence. Accepted for v2; revisit only if recall quality measurably degrades.

## 6. API surface (delta)

| Route | New/changed | Purpose |
|---|---|---|
| `POST /v1/net/ask` | new | cited Q&A over network memory |
| `POST /v1/net/play` | new | log a play (owner-signed) |
| `POST /v1/net/play/close` | new | close → triggers post-mortem |
| `GET /v1/net/plays` | new | open/closed plays + live P&L |
| `POST /v1/net/compile` | changed | spec gains wallets/deepbook/epsilon/cadences |
| `POST /v1/net/workflow` | changed | accepts full v2 spec; creates WorkflowRecord |
| `GET /v1/net/workflow` | changed | returns record (status, cursor, endsAt) |
| `POST /v1/net/wallet` | new | attach/detach a watch address to a set |

## 7. UI (delta)

- Canvas: `wallet:0xab…cd` node (teal) and `deepbook` node (orange) as sources; auto-rendered from compiled spec like v1 assets/strategy.
- Build zone: Plays card — log form (asset, direction, entry, target, stop, thesis) + open-plays list with live P&L chips + close button.
- Memory & activity: Ask box above the op feed (streaming, cited); trends render as larger nodes in graph view.
- Workflow card: wallet address field; deepbook toggle; cadence fields collapsed behind "advanced".

## 8. Economy layer — DESIGN-ONLY seam (nothing built in v2)

Kept so v2 code doesn't need rewriting later:
- `WorkflowRecord.paid` field exists and is ignored.
- Future: Move `workflow_registry` — `start_workflow(Coin<WAL>, config_hash, duration) → WorkflowTicket`; backend verifies ticket before activating a record. Price formula: `fee ≈ walrus_storage(epochs × bytes) + llm_tokens + margin`.
- Future second ticket: **metered Ask** over a Seal-gated set — sell answers, not datasets (assessed 2026-06-10: dataset marketplaces fail; metered query access is the evidence-backed form, and it uses the rerank/answer moat). Requires real `@mysten/seal` (known gap — `access/seal.ts` is passphrase AES today).
- Explicit non-goals for v2: marketplace UI, dataset purchase, exchange API keys, EVM chains, on-chain anchoring.

## 9. Risks

| Risk | Mitigation |
|---|---|
| DeepBook event pagination/indexer reliability | dual path (RPC events / hosted indexer), event-id dedup, capped backfill |
| LLM schema failures (~1/3 on gpt-oss-120b) | all LLM steps phrase-only over code-computed numbers; chatJSON retries for compile |
| MemWal/CRDT drift after prune | live-state filter at ask time (5.2) |
| Server restart mid-run | M5 record persistence + cursor resume; no catch-up ticks |
| Walrus checkpoint transient failures | keep error surfaced (v1 lesson: a swallowed checkpoint failure hid data risk) |
| Wallet-agent bloat | epsilon gate at source + consolidator downstream |

## 10. Milestones (each ends verified)

| M | Scope | Verify |
|---|---|---|
| M1 | wallet agent + spec.wallets + canvas node | `scripts/test-wallet.ts` vs real address; snapshot neuron, epsilon gate holds |
| M2 | `/v1/net/ask` + Ask UI | HTTP test: 3 ticks → ask portfolio question → cited answer from wallet-agent |
| M3 | plays + evaluator + post-mortem | `scripts/test-plays.ts`: log → tick → evaluation math exact; close → post-mortem |
| M4 | deepbook agent + spec.deepbook | `scripts/test-deepbook.ts` vs an address with DeepBook history; fills dedup |
| M5 | WorkflowRecord persist/resume | kill server mid-run → boot → cursor resumes, no catch-up ticks, root intact |
| M6 | consolidator + prune | `scripts/test-lifecycle.ts`: 200 synthetic ticks → trends, raws removed, ask prefers trends, client/server roots match |
| M7 | daily brief | forced date-rollover → one Telegram digest |

Order: M1 → M2 ship together (first demo: paste address → prompt → ask). M3 next (differentiator). M4, M5 parallelizable. M6 → M7 last.
