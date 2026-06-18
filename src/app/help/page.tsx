"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { neuronColor, trustColor, durabilityColor } from "../dashboard/config";

type Section = { id: string; label: string };

const GROUPS: { group: string; items: Section[] }[] = [
  {
    group: "Start here",
    items: [
      { id: "intro", label: "What is Neurus" },
      { id: "getting-started", label: "Getting started" },
      { id: "concepts", label: "Core concepts" },
    ],
  },
  {
    group: "Command line",
    items: [
      { id: "cli", label: "Neurus CLI" },
    ],
  },
  {
    group: "Workspace",
    items: [
      { id: "overview", label: "Overview" },
      { id: "neurons", label: "Neurons" },
      { id: "ask", label: "Ask" },
      { id: "brain", label: "Second Brain" },
      { id: "sets", label: "Sets" },
      { id: "datasets", label: "Datasets" },
    ],
  },
  {
    group: "Agents",
    items: [
      { id: "agents", label: "Agents" },
      { id: "network", label: "Network & workflows" },
      { id: "sharing", label: "Sharing with Seal" },
    ],
  },
  {
    group: "Connect",
    items: [
      { id: "settings", label: "Model & provider" },
      { id: "connect", label: "MCP, API & widgets" },
    ],
  },
];

const ALL_IDS = GROUPS.flatMap((g) => g.items.map((i) => i.id));

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

function H({ id, kicker, title }: { id: string; kicker?: string; title: string }) {
  return (
    <div className="scroll-mt-24" id={id}>
      {kicker && <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9aa8f0]/70">{kicker}</div>}
      <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight text-white">{title}</h2>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14.5px] leading-[1.7] text-white/55">{children}</p>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#9aa8f0]/30 bg-[#9aa8f0]/10 text-[12.5px] font-semibold text-[#bcc6ff]">
        {n}
      </div>
      <div className="pt-0.5">
        <h3 className="text-[14.5px] font-medium text-white/90">{title}</h3>
        <div className="mt-1 text-[13.5px] leading-relaxed text-white/50">{children}</div>
      </div>
    </div>
  );
}

function Feature({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium text-white/90">{title}</h3>
        <Link href={href} className="shrink-0 text-[12.5px] text-[#9aa8f0] transition hover:text-[#bcc6ff]">
          Open →
        </Link>
      </div>
      <div className="mt-2 text-[13.5px] leading-relaxed text-white/50">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[12.5px] text-[#bcc6ff]">
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-[12.5px] leading-relaxed text-white/75">
      {children}
    </pre>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px] text-white/65">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export default function HelpPage() {
  const active = useScrollSpy(ALL_IDS);

  return (
    <div className="min-h-screen bg-[#0b0c0f] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0c0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/neurus.png" alt="Neurus" width={26} height={26} />
            <span className="text-sm font-semibold tracking-tight">Neurus</span>
            <span className="text-white/20">/</span>
            <span className="text-sm text-white/50">Docs</span>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-white/60 transition hover:border-white/20 hover:text-white"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
          <nav className="space-y-6">
            {GROUPS.map((g) => (
              <div key={g.group}>
                <div className="mb-2 px-3 text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/30">
                  {g.group}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((it) => (
                    <a
                      key={it.id}
                      href={`#${it.id}`}
                      className={`block rounded-md px-3 py-1.5 text-[13px] transition ${
                        active === it.id
                          ? "bg-white/[0.06] font-medium text-white"
                          : "text-white/45 hover:text-white/80"
                      }`}
                    >
                      {it.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 py-14">
          <div className="max-w-2xl space-y-16">
            <section className="space-y-5">
              <H id="intro" kicker="Documentation" title="What is Neurus" />
              <P>
                Neurus is one memory for all your agents — fed by your data, owned by you. It is the intelligence
                layer over agent memory on Walrus: you ingest notes, files, and on-chain data, then share, ask, and
                act on them. Everything you capture is stored durably on Walrus and stays yours.
              </P>
              <P>
                This dashboard is both a developer console for inspecting agent memory and a consumer second brain.
                The sections below walk through every tab and how to use it.
              </P>
              <div className="flex flex-wrap gap-2">
                <Chip color="#9aa8f0" label="Owned & verifiable" />
                <Chip color="#0d9488" label="Stored on Walrus" />
                <Chip color="#9333ea" label="Grounded answers" />
              </div>
            </section>

            <section className="space-y-6">
              <H id="getting-started" kicker="Start here" title="Getting started" />
              <P>Three steps take you from an empty memory to a grounded answer.</P>
              <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <Step n={1} title="Capture something">
                  Add a note in <Link href="/dashboard/brain" className="text-[#9aa8f0] hover:text-[#bcc6ff]">Second Brain</Link>{" "}
                  or upload a file in <Link href="/dashboard/datasets" className="text-[#9aa8f0] hover:text-[#bcc6ff]">Datasets</Link>.
                  Neurus extracts the content into neurons.
                </Step>
                <Step n={2} title="Watch it land">
                  Open <Link href="/dashboard/neurons" className="text-[#9aa8f0] hover:text-[#bcc6ff]">Neurons</Link> to
                  see each memory written live, with its type, trust, and Walrus durability.
                </Step>
                <Step n={3} title="Ask your memory">
                  Go to <Link href="/dashboard/ask" className="text-[#9aa8f0] hover:text-[#bcc6ff]">Ask</Link> and ask a
                  question. You get a grounded answer that cites the exact memories it used.
                </Step>
              </div>
            </section>

            <section className="space-y-5">
              <H id="concepts" kicker="Start here" title="Core concepts" />
              <div className="space-y-4">
                <div>
                  <h3 className="text-[14.5px] font-medium text-white/90">Neurons</h3>
                  <P>
                    A neuron is a single unit of memory — a person, a note, a file, a chunk of a file, an insight, or
                    a commitment. Each type is colored consistently across the app:
                  </P>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.entries(neuronColor) as [string, string][]).map(([t, c]) => (
                      <Chip key={t} color={c} label={t} />
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-[14.5px] font-medium text-white/90">Sets</h3>
                  <P>
                    A set is a named collection of neurons — your workspace boundary. The active set is shown in the
                    top-left breadcrumb and switched from the sidebar. Ask, Neurons, and the Network all scope to the
                    active set.
                  </P>
                </div>
                <div>
                  <h3 className="text-[14.5px] font-medium text-white/90">Trust & durability</h3>
                  <P>
                    Every neuron carries a <span className="text-white/75">trust</span> level (who vouches for it) and
                    a <span className="text-white/75">durability</span> state (whether it is confirmed on Walrus).
                  </P>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.entries(trustColor) as [string, string][]).map(([t, c]) => (
                      <Chip key={t} color={c} label={`trust: ${t}`} />
                    ))}
                    {(Object.entries(durabilityColor) as [string, string][]).map(([t, c]) => (
                      <Chip key={t} color={c} label={t} />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <H id="cli" kicker="Command line" title="Neurus CLI" />
              <P>
                The same owned memory, in your terminal — no browser, no account. One command births an agent with
                its own Sui wallet, and that wallet address becomes its memory namespace on Walrus.
              </P>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <Image src="/terminal.png" alt="Neurus CLI boot screen" width={1324} height={1046} className="h-auto w-full" />
              </div>
              <Pre>{`npm install -g neurus
neurus`}</Pre>
              <P>
                On first run it walks you through two steps, then sets up your memory automatically:
              </P>
              <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <Step n={1} title="Pick a model provider">
                  Choose NVIDIA or OpenRouter and paste your API key. Stored locally at{" "}
                  <Code>~/.neurus/config.json</Code>.
                </Step>
                <Step n={2} title="Create or import a wallet">
                  Generate a fresh Sui keypair, or import an existing one by pasting a{" "}
                  <Code>suiprivkey1…</Code> key. The address namespaces your memory and signs every share.
                </Step>
                <Step n={3} title="Memory account, automatic">
                  Neurus mints a Walrus Memory account on Sui owned by your wallet — funding it from the testnet
                  faucet first if it has no gas. Runs once; saved to <Code>~/.neurus/mcp.json</Code>.
                </Step>
              </div>
              <P>Then you land in the agent. Type to ask; use slash commands for everything else:</P>
              <Pre>{`> Met Sarah at the offsite — design lead, I owe her the deck Friday.
> what do I owe Sarah, and when?
neurus › You owe Sarah the deck, due Friday. [1]

/note <text>      remember a note (extracts people, facts, commitments)
/add <path>  @    upload a file or folder to Walrus and index it
/recall <q>       show the memories matching a query
/plan <goal>      build a plan grounded in your memory
/share [name]     seal this set into a shareable feed → shareId + blobId
/grant <0x…>      grant a Sui address read access to your last feed
/follow <blobId> <shareId>   import a feed shared with you
/whoami  /model  /set <name>  /help  /exit`}</Pre>
              <P>
                Run one-offs without the REPL — <Code>neurus note &quot;…&quot;</Code>,{" "}
                <Code>neurus add ./report.pdf</Code>, <Code>neurus ask &quot;…&quot;</Code>,{" "}
                <Code>neurus reflect</Code>, <Code>neurus whoami</Code>. It also reads plain English: &ldquo;share this
                set with 0x…&rdquo; works without any flags.
              </P>
            </section>

            <section className="space-y-5">
              <H id="overview" kicker="Workspace" title="Overview" />
              <P>
                The landing tab. When your set is empty it shows a three-step onboarding; once you have neurons it
                shows live stats — total neurons, pending writes, people, insights — and a memory-composition bar
                broken down by neuron type. Use it as your at-a-glance health check.
              </P>
              <Feature href="/dashboard" title="Overview">
                Stats + composition for the active set, plus a quick <Code>Ask this memory</Code> shortcut.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="neurons" kicker="Workspace" title="Neurons" />
              <P>
                A live list of every memory written to the active set — your trace view. Each row shows the neuron
                type, trust dot, and Walrus durability dot. Filter by type and forget any neuron you no longer want.
                This is where you confirm that ingestion actually landed.
              </P>
              <Feature href="/dashboard/neurons" title="Neurons">
                Filterable list and graph of every neuron, with per-neuron forget.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="ask" kicker="Workspace" title="Ask" />
              <P>
                A grounded research chat over your memory. Type a question and Neurus retrieves the most relevant
                neurons, reranks them, and streams an answer token by token. Each claim is cited as{" "}
                <Code>[n]</Code> — click a citation to highlight the exact evidence card it came from.
              </P>
              <P>
                Evidence cards show the neuron type, trust, a relevance bar, and the rerank score, so you can judge
                why the answer says what it says. A grounding badge tells you how strongly the answer is supported; if
                nothing matches well, Neurus abstains rather than guessing.
              </P>
              <Feature href="/dashboard/ask" title="Ask">
                Streaming, cited answers with clickable evidence and a grounding badge.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="brain" kicker="Workspace" title="Second Brain" />
              <P>
                The fastest way to capture. Drop in a thought, a person, or a fact and Neurus extracts and remembers
                it as neurons — people, facts, intros, and commitments, separated automatically. Run{" "}
                <span className="text-white/75">Reflect</span> to consolidate raw notes into higher-level insight
                neurons — the system thinking over what you have stored.
              </P>
              <P>
                If you signed in with Google, <span className="text-white/75">Sync calendar</span> pulls your next 30
                days of events into the set as memory you can ask about, and a note that describes a meeting can be
                pushed straight to your Google Calendar.
              </P>
              <Feature href="/dashboard/brain" title="Second Brain">
                Note capture, Google Calendar sync both ways, and Reflect to generate insight neurons.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="sets" kicker="Workspace" title="Sets" />
              <P>
                Create and manage your sets. From here you can switch the active set, control its visibility, mark a
                set as verified, and index an existing Walrus blob into a set. Sets are how you keep different
                projects or knowledge bases separate.
              </P>
              <Feature href="/dashboard/sets" title="Sets">
                Create, switch, set visibility, and verify knowledge sets.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="datasets" kicker="Workspace" title="Datasets" />
              <P>
                The tab that publishes real blobs to Walrus. Bring in content from many sources: upload a file
                (txt, md, csv, json, pdf, docx), crawl a web page, pull a GitHub repo, ingest a local folder, or
                import an existing Walrus blob by its blob id. Each source is chunked, embedded, and stored with its
                Sui object id so it becomes askable.
              </P>
              <P>
                Every dataset card shows a live <span className="text-white/75">Memory Health</span> badge — whether
                it is certified on Sui and how many epochs until it expires — a Walruscan link, and a Renew action to
                refresh its storage epochs before it lapses.
              </P>
              <P>
                Turn any dataset into an embeddable <span className="text-white/75">Ask AI</span> widget: name it,
                lock it to your domains, and paste one <Code>&lt;script&gt;</Code> tag on your site. Visitors get
                grounded, cited answers — read-only, scoped to exactly the data you chose.
              </P>
              <Feature href="/dashboard/datasets" title="Datasets">
                Upload files, web, GitHub, and folders to Walrus with live health, renew, and embeddable widgets.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="agents" kicker="Agents" title="Agents" />
              <P>
                Define focused Q&amp;A agents bound to your data. Name an agent, describe what it does, and choose the
                dataset it works on — the whole set or a single dataset inside it. Each agent answers, with citations,
                only from the data you scoped to it, and you can ask it inline right from the tab.
              </P>
              <Feature href="/dashboard/agents" title="Agents">
                Create dataset-bound agents and ask them grounded questions in place.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="network" kicker="Agents" title="Network & workflows" />
              <P>
                The Network tab runs your agents over live data. Pick agents to run — your own dataset-bound agents
                that ground a workflow in your notes, plus ready-made ones for protocol TVL (Aave, Uniswap, Lido,
                Curve, Compound), asset prices (SUI, ETH, BTC, SOL), and DeepBook. The runner ticks on your interval,
                writes observation neurons, consolidates them into trends over time, and can send a grounded report or
                a daily brief to Telegram.
              </P>
              <P>
                You don&apos;t have to configure it by hand. Describe what you want in plain language — for example,{" "}
                <span className="italic text-white/65">
                  &ldquo;for the next 5 days send Telegram updates on SUI based on my trading-rules strategy, every
                  minute&rdquo;
                </span>{" "}
                — and Neurus compiles it into a running workflow: the strategy set to ground in, the assets and
                protocols to track, the interval, and the duration.
              </P>
              <P>
                <span className="text-white/75">Write access</span> controls who can write to the shared set — the
                workflow&apos;s agents plus anyone you grant; revoke one and its next write bounces.{" "}
                <span className="text-white/75">Plays</span> let you log positions that the analyst grades against
                your strategy each cycle, writing a post-mortem when you close.
              </P>
              <Feature href="/dashboard/network" title="Network">
                Run agents on live data, describe workflows in plain English, manage write access, and track plays.
              </Feature>
            </section>

            <section className="space-y-5">
              <H id="sharing" kicker="Agents" title="Sharing with Seal" />
              <P>
                Share a set across users and agents with confidential, revocable read access. Neurus seals a set
                snapshot to Walrus using Mysten Seal (threshold encryption) and an on-chain allowlist policy: you
                grant a reader&apos;s address, they can decrypt; you revoke, and their next decrypt is denied.
              </P>
              <P>
                The server never holds your keys — encryption and Walrus storage happen server-side, but creating
                the share and granting, revoking, or decrypting all run from your own wallet. Your memory stays
                yours, even when shared.
              </P>
            </section>

            <section className="space-y-5">
              <H id="settings" kicker="Connect" title="Model & provider" />
              <P>
                The model and provider used for answers and reflection are shown in the top bar — click the pill to
                open settings and switch them. Ask, Second Brain reflection, and workflow analysts all use the model
                you select here.
              </P>
              <P>
                The free default runs on NVIDIA at no cost. Premium models are routed through OpenRouter and unlocked
                once with a small on-chain payment on Sui; after that they&apos;re flat-rate. If a free request ever
                hits a rate limit, Neurus silently falls back to a free model rather than showing you an error.
              </P>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <P>
                  Tip: press <Code>⌘K</Code> in the top bar to search and jump between tabs quickly.
                </P>
              </div>
            </section>

            <section className="space-y-6">
              <H id="connect" kicker="Connect" title="MCP, API & widgets" />
              <P>
                Neurus is the same memory however you reach it. Beyond the dashboard and CLI, plug it into your own
                agents and tools:
              </P>
              <div className="space-y-4">
                <div>
                  <h3 className="text-[14.5px] font-medium text-white/90">MCP server</h3>
                  <P>
                    The CLI ships an MCP server so Claude Code, Cursor, or Claude Desktop can read and write your
                    Walrus memory as tools — <Code>list_sets</Code>, <Code>recall</Code>, <Code>ask</Code>,{" "}
                    <Code>remember</Code>, and the feed-sharing tools.
                  </P>
                  <Pre>{`neurus setup
claude mcp add neurus neurus-mcp --scope user`}</Pre>
                </div>
                <div>
                  <h3 className="text-[14.5px] font-medium text-white/90">HTTP API</h3>
                  <P>
                    Point any agent at the <Code>/v1</Code> HTTP API — <Code>remember</Code>, <Code>recall</Code>,{" "}
                    <Code>ask</Code> (streaming), <Code>retrieve</Code>, <Code>forget</Code>, and more. Each request
                    carries an <Code>x-neurus-user</Code> header that scopes it to that user&apos;s namespace.
                  </P>
                </div>
                <div>
                  <h3 className="text-[14.5px] font-medium text-white/90">A2A &amp; widgets</h3>
                  <P>
                    Any set can answer as a discoverable Agent2Agent endpoint, or be embedded as a read-only{" "}
                    <Code>Ask AI</Code> widget on your own site (created in Datasets) — one script tag, origin-locked.
                  </P>
                </div>
              </div>
            </section>

            <div className="border-t border-white/10 pt-8">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-[#9aa8f0] px-4 py-2 text-[13px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
