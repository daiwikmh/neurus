import type { ReactNode } from "react";
import { Reveal } from "./primitives";
import { Container } from "./Container";

const code = `const neurus = await Neurus.open("my-agent")

// Remember anything — extracted into neurons on Walrus
await neurus.note("Sarah is allergic to shellfish. I owe her the deck Friday.")
await neurus.addFile("./contract.pdf")

// Recall by meaning — two-stage retrieval, grounded + cited
const answer = await neurus.ask("what do I owe Sarah, and when?")

// Plug it into any LLM as a retriever
const passages = await neurus.retrieve(query, { topK: 5, mmr: 0.5 })

// Prove the memory was never tampered with
await neurus.makeVerified()
const { ok } = await neurus.verifyIntegrity()`;

const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|\b(const|new|async|await|switch|case|return|let)\b/g;

function highlight(src: string) {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const [full, comment, str, kw] = m;
    if (comment) out.push(<span key={k++} className="text-white/35">{comment}</span>);
    else if (str) out.push(<span key={k++} className="text-[#c3e88d]">{str}</span>);
    else if (kw) out.push(<span key={k++} className="text-[#c792ea]">{kw}</span>);
    last = m.index + full.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

function Ic({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-white/80" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const features = [
  { icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", title: "Capture anything in plain language,", body: "notes and facts extracted into linked neurons automatically." },
  { icon: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12", title: "Store files on Walrus,", body: "PDFs, docs, and folders chunked and indexed for recall." },
  { icon: "M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", title: "Recall by meaning, not keywords,", body: "two-stage retrieval with a cross-encoder reranker." },
  { icon: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 9h16M8 4v5", title: "Grounded, cited, conflict-aware answers,", body: "it surfaces contradictions instead of guessing." },
  { icon: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15", title: "Swap models, keep the context,", body: "one owned memory — Claude, Gemini, and GPT stay in sync as you switch." },
  { icon: "M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z", title: "Plug into Claude, Cursor, any agent,", body: "memory exposed as tools over MCP and A2A — model-agnostic." },
  { icon: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", title: "Proactive insights while you're away,", body: "sleep-time reflection synthesizes what matters." },
  { icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8", title: "Share memory across agents,", body: "verifiable, access-controlled knowledge sets on Walrus." },
];

export function PlatformShowcase() {
  return (
    <section className="relative overflow-hidden py-24">
      {/* spectrum band decoration */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-2 opacity-70">
        {["#3b82f6", "#38bdf8", "#a3e635", "#facc15", "#fb923c", "#f87171", "#ef4444"].map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      {/* soft glow behind the panel */}
      <div
        className="pointer-events-none absolute -left-24 bottom-0 h-[420px] w-[560px] rounded-full opacity-30 blur-[130px]"
        style={{ background: "radial-gradient(circle, #4f46e5, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -right-24 top-10 h-[360px] w-[460px] rounded-full opacity-20 blur-[130px]"
        style={{ background: "radial-gradient(circle, #2563eb, transparent 70%)" }}
      />

      <Container className="grid items-start gap-10 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Drop in. Remember.</h2>
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d10]">
            <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7] text-white/80">
              <code>{highlight(code)}</code>
            </pre>
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
              <button className="rounded-md border border-white/10 p-1.5 text-white/40 transition hover:text-white/70" aria-label="Copy code">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              </button>
              <span className="rounded-lg bg-white/[0.06] px-3.5 py-1.5 text-sm text-white/80">Run ↵</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent backdrop-blur-sm">
            <div className="border-b border-white/10 px-6 py-5">
              <h3 className="text-[15px] font-medium text-white">A complete memory API</h3>
              <p className="mt-0.5 text-[13px] text-white/40">owned, verifiable, on Walrus</p>
            </div>
            <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="divide-y divide-white/10">
                {features.slice(0, 4).map((f) => (
                  <div key={f.title} className="p-6">
                    <Ic d={f.icon} />
                    <h3 className="mt-4 text-[15px] font-medium text-white">{f.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/40">{f.body}</p>
                  </div>
                ))}
              </div>
              <div className="divide-y divide-white/10">
                {features.slice(4).map((f) => (
                  <div key={f.title} className="p-6">
                    <Ic d={f.icon} />
                    <h3 className="mt-4 text-[15px] font-medium text-white">{f.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/40">{f.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
