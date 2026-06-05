"use client";

import { useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus, type Span } from "@/services/neurus";
import { neuronColor, trustColor } from "../config";

interface Turn {
  q: string;
  answer?: string;
  sources?: string[];
  spans?: Span[];
  error?: string;
  loading: boolean;
}

function SpanRow({ s }: { s: Span }) {
  const pct = Math.round(s.relevance * 100);
  return (
    <div className="flex items-center gap-3 border-t border-white/5 py-2 text-[12.5px] first:border-t-0">
      <span className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase" style={{ background: `${neuronColor[s.type]}22`, color: neuronColor[s.type] }}>
        {s.type}
      </span>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: trustColor[s.trust] }} title={s.trust} />
      <span className="flex-1 truncate text-white/70">{s.title}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-gradient-to-r from-[#9aa8f0] to-[#a855f7]" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-20 text-right font-mono text-[11px] text-white/40">rel {pct}% · {s.score.toFixed(1)}</span>
    </div>
  );
}

export default function AskPage() {
  const { active, online } = useSets();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  const submit = async () => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    const idx = turns.length;
    setTurns((t) => [...t, { q, loading: true }]);
    try {
      const r = await neurus.ask(active, q);
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, ...r, loading: false } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, error: (e as Error).message, loading: false } : x)));
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ask</h1>
        <p className="mt-1 text-sm text-white/45">
          Query <span className="font-mono text-white/70">{active}</span> — grounded, cited answers with the exact recall spans behind them.
        </p>
      </div>

      <div className="mt-6 flex-1 space-y-8 overflow-y-auto pb-4">
        {turns.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
            Ask your memory anything. The answer comes only from stored neurons — and you see which ones it used.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i}>
            <div className="text-[13px] font-medium text-[#9aa8f0]">{t.q}</div>
            {t.loading ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-white/40">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                recalling + reasoning…
              </div>
            ) : t.error ? (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{t.error}</div>
            ) : (
              <>
                <div className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[14.5px] leading-relaxed text-white/85">
                  {t.answer}
                </div>
                {t.spans && t.spans.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-[#0c0d10] px-4 py-3">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-white/30">recall spans · what it retrieved &amp; why</div>
                    {t.spans.map((s) => (
                      <SpanRow key={s.id} s={s} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2">
        {!online && <div className="mb-2 text-[12px] text-amber-400/80">Engine offline — run npm run api in the neuron/ folder.</div>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ask this memory…"
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none focus:border-[#9aa8f0]/50"
          />
          <button onClick={submit} className="rounded-xl bg-[#9aa8f0] px-5 text-sm font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
