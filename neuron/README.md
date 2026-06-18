# neurus

**Owned, verifiable AI memory in your terminal.**

`neurus` is a personal memory agent that lives in your shell. One command births an agent with its own Sui wallet — and that wallet address *is* its memory namespace on [Walrus](https://www.walrus.xyz/). Take notes, drop in files, ask questions grounded in your own data, and share memory with other agents through [Seal](https://github.com/MystenLabs/seal)-gated feeds. Nothing is held on someone else's server, and your memory isn't tied to any single model.

```bash
npm install -g neurus
neurus
```

That's it — the first run walks you through two steps and drops you into the agent.

---

## First run

The very first time you launch, `neurus` asks two things:

**1. Your model provider**
- **NVIDIA** — paste your NVIDIA API key (`integrate.api.nvidia.com`)
- **OpenRouter** — paste an OpenRouter key to use any model it hosts

**2. Your wallet**
- **Create new** — generates a fresh Sui keypair; the address becomes your memory namespace
- **Import existing** — paste a Sui private key (`suiprivkey1…` or `0x` hex) to reuse a wallet you already own

The same wallet is used everywhere: it namespaces your memory on Walrus *and* signs the on-chain Seal transactions when you share. Credentials are written to `~/.neurus/` (mode `600`) and reused on every later run — you only do this once.

```
> wallet: [1] create new  [2] import existing  (1) 2
> name your agent  scout
> paste your Sui private key (suiprivkey1… or 0x hex) ****************
imported scout · 0xd475…3a2b
```

**Then it mints your memory account automatically.** On first run, `neurus` creates a Walrus Memory account on Sui owned by your wallet. If the wallet has no gas yet (a brand-new one won't), it requests testnet SUI from the faucet and waits for it to land — or shows you the faucet link to fund it manually:

```
Setting up your memory account on Walrus (one-time).
Funding your wallet from the testnet faucet…
Creating your Walrus Memory account on Sui…
memory account ready · 0x7571…a134
```

After that you're in the agent. This runs once; the account credentials are saved to `~/.neurus/mcp.json`.

---

## The agent (REPL)

`neurus` (or `neurus agent`) opens an interactive prompt grounded in a memory set.

```
> Met Sarah at the offsite — design lead, I owe her the deck Friday.
> what do I owe Sarah, and when?
neurus › You owe Sarah the deck, due Friday. [1]
```

Just type to ask — answers come only from your stored memory, with citations. Slash commands:

| Command | What it does |
|---|---|
| `/note <text>` | Remember a note (extracts people, facts, commitments) |
| `/add <path>` · `@` | Upload a file or folder to Walrus and index it; `@` opens a file picker |
| `/recall <q>` | Show the memories that match a query |
| `/plan <goal>` | Build a numbered plan from your memory |
| `/share [name]` | Seal-encrypt this set into a shareable feed → prints `shareId` + `blobId` |
| `/grant <0x…>` | Grant a Sui address read access to your last feed |
| `/follow <blobId> <shareId>` | Import a feed someone shared with you |
| `/blobs` · `/publish` | List uploaded Walrus blobs · snapshot the set to Walrus |
| `/set <name>` · `/model` · `/whoami` | Switch set · change model · show your address |
| `/help` · `/exit` | List commands · leave |

It also understands plain English — *"share this set with 0x…"* or *"follow this feed"* works without the slash commands.

---

## One-off commands

Run a single action without entering the REPL:

```bash
neurus note "Tom prefers async standups"
neurus add ./report.pdf
neurus ask "how does Tom like to meet?"
neurus brief "Sarah"            # pre-meeting brief on a person
neurus reflect                  # synthesize insights from your memory
neurus sets                     # list your knowledge sets
neurus whoami                   # show this agent's Sui address
neurus follow <blobId> --share <shareId>   # import a shared feed
```

Add `--set <name>` to any command to target a specific knowledge set (default: `default`).

---

## Sharing memory across machines

Memory is portable because it lives on Walrus, not on a server. To share a set with another agent:

```
# on your machine
> /share research
shareId  0xabc…   blobId  k3Yc…
> /grant 0xTHEIR_ADDRESS

# on their machine
> /follow k3Yc… 0xabc…
imported 24 neurons from shared feed into "default"
```

They decrypt with **their own** wallet — you never custody their data, and you can revoke the grant on-chain at any time. Sharing needs a Sui testnet wallet with a little gas; the agent's wallet is used automatically.

---

## Use it as an MCP server

`neurus` also ships an MCP server so Claude Code, Cursor, or Claude Desktop can read and write your Walrus memory as tools.

```bash
neurus setup                              # save MemWal + sharing credentials
claude mcp add neurus neurus-mcp --scope user
```

Tools exposed: `list_sets`, `recall`, `ask`, `remember`, `create_feed`, `grant_feed`, `list_feeds`, `share_set`, `inspect_share`.

---

## Configuration

Everything lives in `~/.neurus/` (each file is `600`):

| File | Holds |
|---|---|
| `agent.json` | Your wallet (name, address, secret key) |
| `config.json` | LLM provider, API key, model |
| `mcp.json` | MemWal account + sharing credentials (written by `neurus setup`) |

Environment overrides (optional): `NVIDIA_API_KEY`, `OPENROUTER_API_KEY_FREE`, `OPENROUTER_API_KEY_PREMIUM`, `SUI_TESTNET_PRIVATE_KEY`, `NEURUS_SEAL_PACKAGE`.

**Requirements:** Node ≥ 22.

---

## How it works

Capture → extract *neurons* (people, notes, files, chunks, insights, commitments, skills) → embed for recall + Seal-encrypt the bodies → store on Walrus / MemWal. Asking runs a broad vector recall, a local cross-encoder re-rank for precision, then a grounded, cited answer. Each task's outcome is distilled into a reusable *skill* neuron and primed into the next similar task, so the agent develops over time rather than staying flat. Your wallet anchors ownership on Sui; Seal makes every share revocable and verifiable.

Part of [Neurus](https://neurus.xyz) — owned memory you can carry between Claude, Gemini, and GPT.

## License

MIT
