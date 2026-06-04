# Neurus

Persistent intelligence infrastructure for AI agents, built on Walrus. Every
investigation becomes a reusable, versioned, verifiable intelligence artifact —
stored on Walrus, indexed via MemWal, coordinated through a tiered global state.

See [`TECHNICAL_IMPLEMENTATION.md`](./TECHNICAL_IMPLEMENTATION.md) for the full spec.

## Build status

**Backend-first.** The web dashboard (`apps/web`) is deferred — we ship the
agent + memory + Walrus loop first and run it via API/CLI, then build UI on top.

## Layout

```
packages/
  core/            shared zod schemas + types + thresholds (no deps)
  memory/          the three tiers: L1 Redis · L2 MemWal · L3 Walrus + router/scorer
  agents/          research / audit / synthesis agents + orchestrator + tools
  watchers/        external-state sensors (blockchain / price / governance / social)
  feature-engine/  raw event → structured ExtractedFeature (rule pass + LLM pass)
  contradiction/   compare features vs beliefs → proactive action
workers/
  sleep-compute    always-on proactive loop (watch → extract → contradict → act)
scripts/           one-time setup (memwal / walrus / seed watchers)
```

### Dependency direction

`core` ← everything. `memory` ← `agents`, `feature-engine`, `contradiction`.
Only `memory` talks to the Walrus stack (MemWal / Walrus / Redis); every other
package goes through it. This keeps the storage integration in one swappable place.

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in keys
pnpm typecheck
pnpm sleep-compute     # runs the proactive loop (once watchers are seeded)
```

> MemWal/Seal/Walrus SDK signatures in the code are per the spec and marked where
> they need verification against the installed packages — confirm before first run.
