"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { publicAskStream, publicWidget } from "@/services/neurus";

interface Span { id: string; title: string; preview?: string }
interface Turn { q: string; answer?: string; sources?: string[]; spans?: Span[]; error?: string; loading: boolean; streaming?: boolean }

export default function EmbedPage() {
  const params = useParams();
  const widgetId = String(params.widgetId ?? "");
  const [name, setName] = useState("Ask AI");
  const [missing, setMissing] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!widgetId) return;
    publicWidget(widgetId).then((w) => setName(w.name)).catch(() => setMissing(true));
  }, [widgetId]);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setInput("");
    const idx = turns.length;
    setTurns((t) => [...t, { q, loading: true, answer: "" }]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 40);
    const patch = (fn: (x: Turn) => Turn) => setTurns((t) => t.map((x, i) => (i === idx ? fn(x) : x)));
    try {
      await publicAskStream(widgetId, q, (ev) => {
        if (ev.event === "spans") patch((x) => ({ ...x, spans: ev.data.spans }));
        else if (ev.event === "token") patch((x) => ({ ...x, loading: false, streaming: true, answer: (x.answer ?? "") + ev.data.t }));
        else if (ev.event === "done") patch((x) => ({ ...x, loading: false, streaming: false, answer: ev.data.answer, sources: ev.data.sources }));
        else if (ev.event === "error") patch((x) => ({ ...x, loading: false, streaming: false, error: ev.data.error }));
      });
      patch((x) => ({ ...x, loading: false, streaming: false }));
    } catch (e) {
      patch((x) => ({ ...x, error: e instanceof Error ? e.message : "failed", loading: false, streaming: false }));
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#0b0c0f] text-white">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-[#9aa8f0]" />
        <span className="text-sm font-medium">{name}</span>
        <span className="ml-auto text-[10px] text-white/30">grounded on Walrus</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {missing ? (
          <div className="mt-10 text-center text-sm text-white/40">This assistant isn’t available.</div>
        ) : turns.length === 0 ? (
          <div className="mt-10 text-center text-sm text-white/40">Ask me anything about {name}.</div>
        ) : (
          turns.map((t, i) => (
            <div key={i}>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#9aa8f0]/15 px-3 py-1.5 text-[13px]">{t.q}</div>
              </div>
              {t.loading ? (
                <div className="mt-2 flex items-center gap-2 text-[13px] text-white/40">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/70" /> thinking…
                </div>
              ) : t.error ? (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-300">{t.error}</div>
              ) : (
                <div className="mt-2 rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.02] p-3">
                  <Markdown text={t.answer ?? ""} size="sm" streaming={t.streaming} />
                  {t.sources && t.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/8 pt-2">
                      {t.spans?.map((s, n) => (
                        <span key={s.id} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/45" title={s.preview}>
                          <span className="text-[#aeb9f4]">{n + 1}</span> {s.title.length > 28 ? s.title.slice(0, 28) + "…" : s.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(input)}
            placeholder="Ask a question…"
            disabled={missing}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] outline-none focus:border-[#9aa8f0]/50 disabled:opacity-40"
          />
          <button onClick={() => ask(input)} disabled={missing} className="rounded-xl bg-[#9aa8f0] px-4 text-[13px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40">
            Ask
          </button>
        </div>
        <div className="mt-1.5 text-center text-[10px] text-white/25">Powered by Neurus</div>
      </div>
    </div>
  );
}
