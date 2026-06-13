"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const TOUR_KEY = "neurus_tour_v2";

type Step = { target: string; tag: string; title: string; body: string };

const STEPS: Step[] = [
  { target: "brand", tag: "Welcome", title: "Welcome to Neurus", body: "The intelligence layer over your data on Walrus. Quick 30-second tour — here's where everything lives. Press Skip anytime to end tour." },
  { target: "setswitcher", tag: "Sets", title: "Your active set", body: "Everything you do happens inside a set — a self-contained knowledge space. Switch or create sets right here." },
  { target: "grid", tag: "Overview", title: "Overview", body: "Your home base: live stats and what your memory is made of, at a glance." },
  { target: "pulse", tag: "Neurons", title: "Neurons", body: "Every memory Neurus stores, in real time — each tagged with its type, trust level, and durability." },
  { target: "spark", tag: "Ask", title: "Ask", body: "Grounded, streamed answers that cite the exact sources they used. Click a citation to see its evidence." },
  { target: "brain", tag: "Second Brain", title: "Second Brain", body: "Jot notes in plain language; Neurus extracts the people, facts, and commitments — and reflects for insights." },
  { target: "layers", tag: "Sets", title: "Sets", body: "Manage knowledge spaces: publish a snapshot durably to Walrus, or verify integrity with an on-chain anchor." },
  { target: "database", tag: "Datasets", title: "Datasets", body: "Bring knowledge in: upload files, crawl docs from a URL, import a GitHub repo — or embed a cited chatbot." },
  { target: "agents", tag: "Agents", title: "Agents", body: "Dataset-bound specialists you can ask on demand or put to work — each also callable by other AI agents over A2A." },
  { target: "network", tag: "Network", title: "Network", body: "Share sets as Seal-gated feeds others follow with their own wallet, and run shared-memory workflows — custodian-blind." },
  { target: "profile", tag: "You", title: "You & settings", body: "Your account, model, wallet, and Telegram live here — plus “Take a tour” to replay this anytime." },
];

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const CARD_W = 320;

export function ProductTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(TOUR_KEY)) setOpen(true);
    const start = () => { setI(0); setOpen(true); };
    window.addEventListener("neurus:start-tour", start);
    return () => window.removeEventListener("neurus:start-tour", start);
  }, []);

  const close = useCallback(() => {
    localStorage.setItem(TOUR_KEY, "done");
    setOpen(false);
    setI(0);
    setRect(null);
  }, []);

  const next = useCallback(() => setI((n) => (n >= STEPS.length - 1 ? (close(), n) : n + 1)), [close]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // Measure the current step's target element, and keep it in sync on resize/scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${STEPS[i].target}"]`);
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, close]);

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Position the card to the right of the highlighted element, clamped to the viewport.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let cardLeft = vw / 2 - CARD_W / 2;
  let cardTop = vh / 2 - 100;
  if (rect) {
    cardLeft = rect.left + rect.width + 18;
    if (cardLeft + CARD_W > vw - 12) cardLeft = rect.left - CARD_W - 18;
    if (cardLeft < 12) cardLeft = 12;
    cardTop = Math.min(Math.max(12, rect.top - 8), vh - 230);
  }

  return (
    <div className="fixed inset-0 z-[2000]">
      {/* Spotlight: the box-shadow dims everything except the highlighted element */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-[#9aa8f0] transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/66" />
      )}

      {/* Click-catcher so the dimmed area doesn't pass clicks to the app underneath */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* The coachmark card */}
      <div
        key={i}
        className="tour-pop absolute w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12] shadow-[0_24px_80px_rgba(0,0,0,.6)]"
        style={{ left: cardLeft, top: cardTop }}
      >
        <div className="h-[3px] w-full bg-gradient-to-r from-[#9aa8f0] via-[#aeb9f4] to-transparent" />
        <div className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.16em] text-[#aeb9f4]">{step.tag}</span>
            <span className="text-[11px] tabular-nums text-white/35">{i + 1} / {STEPS.length}</span>
          </div>
          <h2 className="mt-2.5 text-[15px] font-semibold tracking-tight text-white">{step.title}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{step.body}</p>

          <div className="mt-4 flex items-center gap-1.5">
            {STEPS.map((_, n) => (
              <button
                key={n}
                onClick={() => setI(n)}
                aria-label={`Step ${n + 1}`}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-[#9aa8f0]" : "w-1.5 bg-white/15 hover:bg-white/30"}`}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button onClick={close} className="text-[12px] text-white/40 transition hover:text-white/70">Skip</button>
            <div className="flex items-center gap-2">
              {i > 0 && (
                <button onClick={back} className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-white/70 transition hover:bg-white/[0.06]">Back</button>
              )}
              <button onClick={next} className="rounded-lg bg-[#9aa8f0] px-4 py-1.5 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">
                {last ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .tour-pop { animation: tourPop 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes tourPop {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
