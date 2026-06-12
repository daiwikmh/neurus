"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { useSets } from "../components/SetContext";
import { useSettings } from "../components/SettingsContext";
import { neurus, type Span } from "@/services/neurus";
import { neuronColor, trustColor } from "../config";

interface Turn {
  q: string;
  answer?: string;
  sources?: string[];
  spans?: Span[];
  error?: string;
  loading: boolean;
  streaming?: boolean;
}

const EXAMPLES = ["What do I owe people, and when?", "Summarize what I know about Sarah", "What's blocking the team right now?"];

function grounding(spans: Span[]): { label: string; color: string } {
  const strong = spans.filter((s) => s.score > 0).length;
  if (strong === 0) return { label: "No strong matches", color: "#6b7280" };
  const top = Math.max(...spans.map((s) => s.score));
  const color = top > 2 ? "#34d399" : top > 0 ? "#fbbf24" : "#6b7280";
  return { label: `Grounded in ${strong} ${strong === 1 ? "memory" : "memories"}`, color };
}

function AnswerBody({ text, spans, onCite, streaming }: { text: string; spans: Span[]; onCite: (n: number) => void; streaming?: boolean }) {
  return <Markdown text={text} size="md" streaming={streaming} cite={{ count: spans.length, onCite, title: (n) => spans[n - 1]?.title }} />;
}

function EvidenceCard({ n, s, active, refCb }: { n: number; s: Span; active: boolean; refCb: (el: HTMLDivElement | null) => void }) {
  const pct = Math.round(s.relevance * 100);
  return (
    <div
      ref={refCb}
      className={`rounded-lg border p-3 transition ${active ? "border-[#9aa8f0]/60 bg-[#9aa8f0]/[0.06]" : "border-white/8 bg-white/[0.015]"}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[#9aa8f0]/20 font-mono text-[10px] font-semibold text-[#aeb9f4]">{n}</span>
        <span className="rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase" style={{ background: `${neuronColor[s.type]}22`, color: neuronColor[s.type] }}>
          {s.type}
        </span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: trustColor[s.trust] }} title={s.trust} />
        <span className="flex-1 truncate text-[12.5px] text-white/75">{s.title}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full bg-gradient-to-r from-[#9aa8f0] to-[#a855f7]" style={{ width: `${pct}%` }} />
        </span>
        <span className="w-16 text-right font-mono text-[10px] text-white/35">rel {pct}% · {s.score.toFixed(1)}</span>
      </div>
      {s.preview && <p className="mt-2 pl-7 text-[12px] leading-snug text-white/45">{s.preview}</p>}
    </div>
  );
}

function TurnView({ t }: { t: Turn }) {
  const [cite, setCite] = useState<number | null>(null);
  const [openEvidence, setOpenEvidence] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const onCite = (n: number) => {
    setCite(n);
    setOpenEvidence(true);
    setTimeout(() => cardRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  };

  const copy = () => {
    navigator.clipboard?.writeText(t.answer ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const spans = t.spans ?? [];
  const conflict = !!t.answer && /\bconflict|disagree|contradict|however,|but .* wants\b/i.test(t.answer);
  const g = spans.length ? grounding(spans) : null;

  return (
    <div>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#9aa8f0]/15 px-4 py-2 text-[13.5px] text-white/90">{t.q}</div>
      </div>

      {t.loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
          recalling memories + reasoning…
        </div>
      ) : t.error ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{t.error}</div>
      ) : (
        <div className="mt-3 rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-2.5 flex items-center gap-2">
            {g && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                {g.label}
              </span>
            )}
            {conflict && <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-300/90">⚠ conflict surfaced</span>}
            <button onClick={copy} className="ml-auto text-[11px] text-white/35 transition hover:text-white/70">{copied ? "copied ✓" : "copy"}</button>
          </div>

          <AnswerBody text={t.answer ?? ""} spans={spans} onCite={onCite} streaming={t.streaming} />

          {spans.length > 0 && (
            <div className="mt-3 border-t border-white/8 pt-3">
              <button onClick={() => setOpenEvidence((o) => !o)} className="flex w-full items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-white/35 transition hover:text-white/55">
                <span className={`transition ${openEvidence ? "rotate-90" : ""}`}>▸</span>
                Evidence · {spans.length} retrieved · why this answer
              </button>
              {openEvidence && (
                <div className="mt-2.5 space-y-1.5">
                  {spans.map((s, i) => (
                    <EvidenceCard key={s.id} n={i + 1} s={s} active={cite === i + 1} refCb={(el) => (cardRefs.current[i + 1] = el)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AskPage() {
  const { active, online } = useSets();
  const { askModel } = useSettings();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setInput("");
    const idx = turns.length;
    setTurns((t) => [...t, { q, loading: true, answer: "" }]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 40);
    const patch = (fn: (x: Turn) => Turn) => setTurns((t) => t.map((x, i) => (i === idx ? fn(x) : x)));
    try {
      await neurus.askStream(active, q, (ev) => {
        if (ev.event === "spans") patch((x) => ({ ...x, spans: ev.data.spans }));
        else if (ev.event === "token") patch((x) => ({ ...x, loading: false, streaming: true, answer: (x.answer ?? "") + ev.data.t }));
        else if (ev.event === "done") patch((x) => ({ ...x, loading: false, streaming: false, answer: ev.data.answer, sources: ev.data.sources }));
        else if (ev.event === "error") patch((x) => ({ ...x, loading: false, streaming: false, error: ev.data.error }));
      }, askModel);
      patch((x) => ({ ...x, loading: false, streaming: false }));
    } catch (e) {
      patch((x) => ({ ...x, error: (e as Error).message, loading: false, streaming: false }));
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ask</h1>
        <p className="mt-1 text-sm text-white/45">
          Research <span className="font-mono text-white/70">{active}</span> — every answer is grounded in your owned memory, with the exact evidence behind each claim.
        </p>
      </div>

      <div ref={scrollRef} className="mt-6 flex-1 space-y-7 overflow-y-auto pb-4">
        {turns.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm text-white/45">Ask your memory anything. Answers come only from stored neurons — click any <span className="font-mono text-[#aeb9f4]">[n]</span> to see the exact evidence.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => ask(e)} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-white/60 transition hover:border-white/25 hover:text-white/85">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <TurnView key={i} t={t} />
        ))}
      </div>

      <div className="mt-2">
        {!online && <div className="mb-2 text-[12px] text-amber-400/80">Can&apos;t reach your memory engine — check your connection.</div>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(input)}
            placeholder="Ask this memory…"
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none focus:border-[#9aa8f0]/50"
          />
          <button onClick={() => ask(input)} className="rounded-xl bg-[#9aa8f0] px-5 text-sm font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
