# Neurus — 3-Minute Demo Script

Two segments, ~90 seconds each. **[ACTION]** = what to do on screen. **VO** = what to say.
Keep a `default` set seeded with 1–2 notes beforehand so recall has something to hit.

---

## Part 1 — The CLI (0:00 – 1:30)

> Goal: prove an agent is born from one command, owns its own identity, remembers, and shares across machines.

### 0:00 – 0:15 · Birth
**[ACTION]** Clean terminal in `neuron/`. Type:
```bash
npm run neurus
```
Let the boot panel animate (the NEURUS banner + engine/walrus/identity rows).

> **VO:** "This is Neurus in the terminal. One command births an agent — and it generates its own Sui keypair. That wallet address *is* its memory namespace on Walrus. No signup, no account."

### 0:15 – 0:38 · Remember + ask naturally
**[ACTION]** Type:
```
/note Met Sarah at the offsite — design lead, allergic to shellfish. I owe her the deck Friday.
```
Then, plain text (no command):
```
what do I owe Sarah and when?
```

> **VO:** "I drop in a note. Neurus pulls out the person, the facts, and the commitment as separate memories. Now I just ask — and the answer comes straight from what I stored, cited."

### 0:38 – 0:58 · Ground over a file
**[ACTION]** Type `/add` then a real file (or `@` to open the picker and pick one). After it indexes:
```
summarize the key points in that file
```

> **VO:** "I can hand it a PDF or a folder — it chunks, embeds, and stores it on Walrus. Then every answer is grounded in my own documents, with the evidence behind it."

### 0:58 – 1:20 · Share across machines
**[ACTION]** Type:
```
/share
```
Show the printed `shareId` + `blobId`. Then:
```
/grant 0x<a-second-sui-address>
```

> **VO:** "Here's the part that matters. `/share` seals this memory into a Seal-gated feed on Walrus. I grant another agent's address — and on *their* machine, they run `follow` and decrypt it with their own key. I never custody their data, and I can revoke access on-chain anytime."

### 1:20 – 1:30 · Close
**[ACTION]** Type `/whoami` to show the agent's address.

> **VO:** "Owned, portable, verifiable memory — running entirely from the terminal."

---

## Part 2 — The Web App (1:30 – 3:00)

> Goal: show the second-brain capture loop, cited answers, on-chain durability, and the agent/workflow layer.

### 1:30 – 1:42 · Sign in → Overview
**[ACTION]** Land on `/dashboard` (already signed in via Google or wallet). Pan the Overview: neuron count, memory composition bars.

> **VO:** "Same engine, in the browser. Sign in with Google or a Sui wallet — with the wallet, you self-custody every byte. This is the overview of everything my memory holds."

### 1:42 – 2:02 · Second Brain → capture
**[ACTION]** Go to **Second Brain**. Type a note with a person + a meeting, e.g.
`Lunch with Marcus next Tuesday 1pm to review the Q3 roadmap.`
Hit **Remember**. Show the log line (people / commitments extracted). Optionally click **Reflect**.

> **VO:** "I dump a thought in plain language. It extracts the people and commitments — and because this note has a meeting, it can push the event straight to my Google Calendar. Reflection turns scattered notes into insights on its own."

### 2:02 – 2:25 · Ask → cited evidence
**[ACTION]** Go to **Ask**. Ask `What do I have coming up, and who's involved?` Let it **stream**. Click a `[1]` citation to expand the **evidence card** (relevance %, trust dot, preview).

> **VO:** "Ask anything. The answer streams in, grounded only in my memory — and every claim links to the exact neuron behind it. Click a citation and you see the evidence, its relevance score, and how much I trust the source. If two memories disagree, it flags the conflict instead of guessing."

### 2:25 – 2:43 · Datasets → on-chain durability + widget
**[ACTION]** Go to **Datasets**. Upload a file (or show an existing one). Point at the **Memory Health** badge — "certified on Sui · expires in N epochs." Then point at a **widget** row and its embed snippet.

> **VO:** "Files land on Walrus, and I can prove it — this badge reads the blob's certification straight off Sui, with its expiry. And any dataset becomes an embeddable 'Ask AI' widget — one script tag, read-only, locked to my domains."

### 2:43 – 2:58 · Agents + Network
**[ACTION]** Quick hop to **Agents** (ask a dataset-bound agent inline), then **Network** — show the "Describe a workflow" box with text like *"For 5 days, Telegram me SUI updates against my trading-rules set, every minute."*

> **VO:** "I can spin up agents bound to a dataset, or describe a whole workflow in plain English — live DeFi and price agents, grounded in my own strategy, reporting to Telegram. All running over memory I own."

### 2:58 – 3:00 · Close
**[ACTION]** Cut to the Neurus logo / tagline.

> **VO:** "Neurus. Memory you own — across every model."

---

## Pre-flight checklist
- [ ] Engine running (`npm run api`) and reachable from the web app
- [ ] `neuron/.env.local`: `NVIDIA_API_KEY`, MemWal creds, `OPENROUTER_API_KEY_FREE` (so a rate limit never shows on camera)
- [ ] For the CLI share demo: a funded Sui testnet key (`SUI_TESTNET_PRIVATE_KEY`) + `NEURUS_SEAL_PACKAGE` set, and a second address ready to grant
- [ ] `default` set pre-seeded with a couple of notes
- [ ] A sample PDF/file on hand for the `/add` and Datasets upload
- [ ] Dashboard already authenticated to skip the login wait
