# Neurus — Agent & Algorithms

How the agent is actually built: the retrieval/reasoning stack, the multi-agent layer, and exactly which algorithm runs where. Every claim below is cited to a file in `neuron/src`. Written 2026-06-10; reflects the live `neuron/` engine (the `packages/` layout in old docs is dead).

## 0. One-paragraph mental model

A **neuron** is the atomic memory unit (`core/neuron.ts`) — a typed record (`note | person | file | chunk | insight | commitment`) with a body, provenance (`author`, `trust`), synapses (edges), and `meta`. Bodies are embedded and stored on Walrus via **MemWal**; the durable map lives in a local manifest. **Reading** a memory is a 5-stage retrieval pipeline (recall → fuse → rerank → gate → generate). **Multi-agent** memory is a signed CRDT op-log persisted to Walrus. **Workflows** are scheduled agents that write observations into that shared memory and reason over it. No model is fine-tuned; all "learning" is in-context + memory state.

## 1. The retrieval pipeline (the core read path)

Runs on every `/v1/ask`, `/v1/recall`, `/v1/retrieve`, `/v1/net/ask`, and inside `surface`/`brief`. Implemented in `core/memory.ts::recall` (lines ~135-186).

```
query
  → 1. DENSE recall      (MemWal vector search, bi-encoder)      storage/memwal.ts
  → 2. SPARSE recall     (BM25 over neuron bodies)               retrieval/bm25.ts
  → 3. FUSION            (Reciprocal Rank Fusion, RRF)           retrieval/rrf.ts
  → 4. RERANK            (cross-encoder, query×doc)              retrieval/rerank.ts
  → 5. GATE              (relevance floor · MMR · abstain)       retrieval/margin.ts, mmr.ts
  → grounded generation  (conflict-aware LLM)                    reason/answer.ts
```

### 1.1 Dense recall — bi-encoder vector search (MemWal)
`storage/memwal.ts`. MemWal (Mysten's managed agent-memory relayer) holds Seal-encrypted neuron bodies on Walrus and a **vector index in the relayer's Postgres**. `recall(query, limit)` returns `{blob_id, text, distance}` by embedding distance. We treat this index as a **disposable cache** — Walrus is truth; it's rebuildable via `restore(namespace)`. This is the "broad retrieval" stage (high recall, coarse ranking). Rate limit: **30 weighted-req/min per delegate key**, which is why writes use `rememberAsync` (no polling) and a throttled queue.

### 1.2 Sparse recall — BM25
`retrieval/bm25.ts`. Classic Okapi BM25, `k1 = 1.5`, `b = 0.75`, IDF `log(1 + (N−n+0.5)/(n+0.5))`, length-normalized term frequency over an in-memory corpus of neuron bodies. Catches exact-term/rare-token matches the embedding misses (names, tickers, ids).

### 1.3 Fusion — Reciprocal Rank Fusion
`retrieval/rrf.ts`. Merges the dense and sparse rankings by `score(id) = Σ 1/(k + rank_i)`, `k = 60`. Rank-based (not score-based) so the two incomparable scales combine without normalization. Hybrid is **on by default** (`opts.hybrid ?? true`); when off, a keyword fallback over `pending` (not-yet-embedded) neurons keeps just-written items findable instantly.

### 1.4 Rerank — cross-encoder
`retrieval/rerank.ts`. Model `Xenova/ms-marco-MiniLM-L-6-v2` via `@huggingface/transformers`, local ONNX (fp32, no API key, ~3ms/pair after warmup). Unlike the bi-encoder (encodes query and doc separately), the cross-encoder scores the **(query, doc) pair jointly** → far better precision on the top candidates. This is the precision layer that the raw MemWal/Walrus stack does not provide — a core differentiator. Raw logit → `sigmoid` → calibrated `relevance` (`core/memory.ts:179`).

### 1.5 Gate — diversity, confidence, abstention
`retrieval/margin.ts`, `retrieval/mmr.ts`.
- **MMR** (Maximal Marginal Relevance, `mmr.ts`): optional re-selection trading relevance vs novelty, `score = λ·rel − (1−λ)·maxJaccard(selected)`; Jaccard over 3+char tokens as the diversity metric. Drops near-duplicate neurons.
- **Confidence / abstain** (`margin.ts`): `softmaxShares` → `concentration` (`standsOut`) measures how much the top hit dominates the field. If concentration < `opts.abstain`, recall returns `[]` — the agent says "I don't have that" instead of surfacing noise. `relativeRelevance` (share × concentration) feeds the proactive surfacer.

### 1.6 Generation — conflict-aware grounding
`reason/answer.ts` over `llm/nvidia.ts`. Model: **NVIDIA-hosted `openai/gpt-oss-120b`** (env-swappable `NVIDIA_MODEL`; Kimi was dropped for unreliability). The system prompt forces **answer-only-from-provided-neurons**, numbered citations, and explicit **conflict handling**: when items disagree it weights by **authority** (a decision-maker outranks a peer), **trust** (`owned > shared > untrusted`), and **recency** (newer supersedes older) — and surfaces the disagreement rather than silently picking. Degraded fallback returns the top neuron verbatim if the model is unreachable. Structured outputs use `chatJSON` (`llm/nvidia.ts`): fenced-JSON extraction + zod parse + 3 retries (the model schema-fails ~⅓ of the time).

## 2. Trust, provenance, and the quality gate

There is **no separate "fact verifier" in the current engine** (an older URL-checking verifier lived in the dead `packages/` tree). Today the anti-fabrication guarantees are three structural mechanisms:
1. **Grounding** — generation is constrained to provided neurons; uncited claims are prompted against.
2. **Trust-tagging** — every neuron carries `source.trust` (`owned`/`shared`/`untrusted`); recall can filter by it and the answer prompt weights by it. An injected memory from an unknown writer is `untrusted` → treated as data, not instruction.
3. **Merkle integrity (opt-in per set)** — see §4.3.

In the v2 cognition layer this is reinforced by a hard rule: **numbers are computed in code, the LLM only phrases** (`net/plays.ts`, `net/lifecycle.ts`). The model never does arithmetic or decides what to delete.

## 3. Proactive layer (sleep-time cognition)

Not a cron watcher — two algorithms:
- **Reflection** (`proactive/reflect.ts`): "sleep-time compute." Takes the ~30 most recent non-insight neurons, asks the model to **synthesize high-level insights** (patterns, contradictions, newly-actionable items — not restatements), writes them back as `insight` neurons linked to their sources via `reflects_on` synapses. Each gets an `importance` 0..1.
- **Surfacing** (`proactive/surface.ts`): decides what deserves attention. Gate score = `0.45·importance + 0.30·relevance + 0.25·recency` (relevance only when a context query is given; else `0.64·importance + 0.36·recency`). Recency is exponential decay with a 7-day half-life-ish constant. Only candidates above `bar` surface. This is the "interruption calculus."

## 4. Multi-agent memory (the CRDT substrate)

`crdt/oplog.ts`, `crdt/replica.ts`, `net/manager.ts`, `net/hub.ts`. This is what makes memory shareable across agents with permissions and convergence.

### 4.1 Signed op-log + capabilities
Every write is an `Op {type: add|remove|update, neuronId, tag, neuron?, lamport, actor, sig}`. The signature is `sha256(secret : payload)` (`oplog.ts:20`); `Capabilities.verify` checks the actor's granted secret. An op from an actor without a capability is **dropped at merge** — this is how grant/revoke works (revoke → the next write bounces, rendered red in the UI). It's a capability-based auth model, the off-chain twin of a Seal grant.

### 4.2 CRDT merge — OR-Set + Lamport
`mergeOps` (`oplog.ts:46`). An **OR-Set** (observed-remove set): adds win, removes only tombstone the specific tags they observed, so concurrent add/remove converges deterministically without a coordinator. **Lamport clocks** give causal ordering (`replica.ts::tick`); ties break by tag. `update` tombstones prior tags for the same neuronId then re-adds (last-writer-by-lamport). Two replicas that have seen the same ops compute identical state — **convergence is the proof agents agree**, no message-passing protocol.

### 4.3 Merkle integrity
`integrity/merkle.ts`. Content-addressed leaf hash per neuron over a **canonical** projection (id, type, body, blob, trust, author, sorted synapses), sorted leaves, binary tree → root. The Network UI **recomputes this root in-browser** and shows "verified" only when it matches the server's — honest agreement, not blind trust. `integrity:"verified"` sets gate recall/ask on root-match (tamper → refuse). On-chain anchoring (`integrity/anchor.ts`) is a stub (`anchorOnSui` throws); the Move HEAD module is drafted but undeployed.

### 4.4 Durability
`net/persist.ts`: each set's op-log + capabilities are sealed (`access/seal.ts`, AES-256-GCM — **not** real Mysten Seal yet) → Walrus blob → local pointer. Server `boot()` restores before listen; 15s checkpoint. Restart restores the exact merkle root.

## 5. Workflow agents (v2 — the autonomous layer)

`net/workflow.ts` + `net/compile.ts`. A workflow is scheduled agents writing into a shared CRDT set and reasoning over it.

- **Compiler** (`compile.ts`): natural language → `WorkflowSpec` via `chatJSON` + zod (strategySet, assets, protocols, wallets, deepbook, cadence, duration). The only place the LLM designs structure; everything downstream is deterministic.
- **Data agents**: per-source signed replicas — DefiLlama TVL, DefiLlama coin prices, Sui wallet balances (`net/wallet.ts`), DeepBook fills (`net/deepbook.ts`). Each writes observation neurons; anti-bloat gates at the source (wallet ε-gate, DeepBook `trade_id` dedup against CRDT state).
- **Analyst** (`groundedReport`): recalls the strategy set (full §1 pipeline) + current data + open plays, composes a grounded update (LLM phrases, numbers precomputed), writes an `insight`, optionally Telegrams.
- **Evaluator + Reflexion** (`net/plays.ts`): deterministic P&L vs logged plays; on close, a post-mortem `insight` (the self-grading loop, after Reflexion 2303.11366).
- **Consolidator** (`net/lifecycle.ts`): the memory-lifecycle algorithm — every C ticks, folds old raw observations per metric into one `trend` neuron with deterministic stats (min/max/mean/Δ/anomaly-count), then **prunes** the raws via CRDT observed-remove. Never folds anomalies, referenced, or recent neurons. Keeps a multi-day run from becoming a landfill; map decay tiers onto storage.
- **State**: the workflow is a durable `WorkflowRecord` (`net/wfpersist.ts`) sealed to Walrus; resumes on reboot from its cursor with no catch-up ticks. The agent is stateful end-to-end.

## 6. Algorithm-to-location index

| Algorithm | File | Used by |
|---|---|---|
| Bi-encoder vector recall | `storage/memwal.ts` | all recall |
| BM25 sparse | `retrieval/bm25.ts` | hybrid recall |
| Reciprocal Rank Fusion | `retrieval/rrf.ts` | hybrid recall |
| Cross-encoder rerank | `retrieval/rerank.ts` | all recall, net ask |
| MMR diversity | `retrieval/mmr.ts` | recall (opt-in) |
| Softmax-concentration confidence/abstain | `retrieval/margin.ts` | recall gate, surfacing |
| Conflict-aware grounded generation | `reason/answer.ts` | ask, net ask |
| Structured decode (JSON+zod+retry) | `llm/nvidia.ts` | compile, reflect |
| Sleep-time reflection | `proactive/reflect.ts` | Second Brain, `/v1/reflect` |
| Importance×recency×relevance surfacing | `proactive/surface.ts` | proactive nudges |
| Signed op-log + capability auth | `crdt/oplog.ts` | network, workflows |
| OR-Set + Lamport CRDT merge | `crdt/oplog.ts`, `crdt/replica.ts` | network |
| Merkle integrity root | `integrity/merkle.ts` | verified sets, network badge |
| Deterministic consolidation + prune | `net/lifecycle.ts` | workflow lifecycle |
| Deterministic P&L + Reflexion | `net/plays.ts` | plays/evaluator |
| NL→workflow compile | `net/compile.ts` | network prompt box |

## 7. Models & external services

- **Generation**: NVIDIA `openai/gpt-oss-120b` (env `NVIDIA_API_KEY`, `NVIDIA_MODEL`). ~⅓ schema-fail on structured → retried.
- **Reranker**: `Xenova/ms-marco-MiniLM-L-6-v2`, local ONNX, no key.
- **Embeddings + body storage**: MemWal relayer → Walrus (env `MEMWAL_ACCOUNT_ID`, `MEMWAL_DELEGATE_KEY`).
- **Market/chain data**: DefiLlama (`api.llama.fi`, `coins.llama.fi`), Sui mainnet RPC + DeepBook indexer (`net/suidata.ts` defaults mainnet via `SUI_DATA_NETWORK`/`SUI_DATA_RPC_URL`, independent of the testnet account network `SUI_NETWORK`).
- **Durability**: Walrus testnet publisher/aggregator (`storage/walrus.ts`).

## 8. Honest limits

- `access/seal.ts` is passphrase AES-256-GCM, **not** Mysten Seal (threshold/on-chain/revocable). Real Seal is only inside MemWal's managed layer.
- `integrity/anchor.ts::anchorOnSui` throws — on-chain merkle anchor unwired; Move HEAD undeployed.
- The durable neuron **map** is local JSON; bodies are safe on Walrus via MemWal, the map is not yet Walrus-anchored.
- gpt-oss-120b confabulates structure ~⅓ of the time → mitigated by retries and by computing all numbers in code.

## 9. Running it

Engine + dashboard:
```bash
cd neuron && npm run api      # HTTP engine on :4318 (mainnet data reads)
npm run dev                   # Next dashboard at repo root; point NEXT_PUBLIC_NEURUS_API at http://localhost:4318
```
The `neuron/scripts/` directory holds operational utilities (`deploy-share`, `set-webhook`, `check-namespace`); the algorithm test scripts were removed from the deployment tree.
