"use client";

import { useState } from "react";
import { useSets } from "../components/SetContext";
import { neurus } from "@/services/neurus";

export default function SecondBrain() {
  const { active, online } = useSets();
  const [note, setNote] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [insights, setInsights] = useState<{ body: string; importance?: number }[]>([]);
  const [calBusy, setCalBusy] = useState(false);
  const [calMsg, setCalMsg] = useState<string | null>(null);

  const syncCalendar = async () => {
    setCalBusy(true);
    setCalMsg(null);
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ set: active }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCalMsg(res.status === 401 ? "Sign out and back in with Google to grant calendar access." : data.error ?? "sync failed");
      } else {
        setCalMsg(`Synced ${data.fetched} events · ${data.added} new, ${data.skipped} already known — into "${data.set}".`);
      }
    } catch (e) {
      setCalMsg((e as Error).message);
    }
    setCalBusy(false);
  };

  const remember = async () => {
    const t = note.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await neurus.remember(active, t);
      setLog((l) => [`✓ remembered · ${r.people.length} people · ${r.commitments.length} commitment(s)`, ...l]);
      setNote("");
      try {
        const cr = await fetch("/api/calendar/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
        const cd = await cr.json();
        if (cd.created) setLog((l) => [`✓ added to calendar · ${cd.summary} @ ${new Date(cd.start).toLocaleString()}`, ...l]);
      } catch {
        /* calendar is best-effort */
      }
    } catch (e) {
      setLog((l) => [`✗ ${(e as Error).message}`, ...l]);
    }
    setBusy(false);
  };

  const reflect = async () => {
    setBusy(true);
    try {
      const r = await neurus.reflect(active);
      setInsights(r.insights);
    } catch {
      setInsights([]);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Second Brain</h1>
      <p className="mt-1 text-sm text-white/45">Dump anything in plain language — people, files, commitments. Neurus files it into neurons you own.</p>
      {!online && <p className="mt-2 text-[12px] text-amber-400/80">Can&apos;t reach your memory engine — check your connection.</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#9aa8f0]"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-white/80">Google Calendar</div>
          <div className="text-[12px] text-white/40">Pull your next 30 days of events into <span className="font-mono text-white/55">{active}</span> as memory you can ask about.</div>
        </div>
        <button onClick={syncCalendar} disabled={calBusy} className="rounded-lg border border-white/15 px-3 py-1.5 text-[13px] text-white/70 transition hover:bg-white/[0.06] disabled:opacity-50">
          {calBusy ? "Syncing…" : "Sync calendar"}
        </button>
      </div>
      {calMsg && <p className="mt-2 text-[12px] text-white/50">{calMsg}</p>}

      <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Met Sarah at the offsite — design lead, allergic to shellfish, Tom introduced us. I owe her the deck Friday."
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-[#0c0d10] px-4 py-3 text-sm leading-relaxed outline-none focus:border-[#9aa8f0]/50"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12px] text-white/30">extracts people, facts, intros &amp; commitments automatically</span>
          <button
            onClick={remember}
            disabled={busy}
            className="rounded-lg bg-[#9aa8f0] px-4 py-2 text-sm font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-50"
          >
            {busy ? "Remembering…" : "Remember"}
          </button>
        </div>
      </div>

      {log.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {log.map((l, i) => (
            <div key={i} className="font-mono text-[12px] text-white/45">{l}</div>
          ))}
        </div>
      )}

      <div className="mt-9 flex items-center justify-between">
        <h2 className="text-sm font-medium text-white/70">Proactive insights</h2>
        <button onClick={reflect} disabled={busy} className="rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-white/50 transition hover:text-white disabled:opacity-50">
          {busy ? "Reflecting…" : "Reflect now"}
        </button>
      </div>
      <div className="mt-3 space-y-2.5">
        {insights.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-white/35">
            Sleep-time reflection synthesizes patterns across your notes. Add a few, then reflect.
          </div>
        ) : (
          insights.map((ins, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <span className="mt-0.5 text-[#a855f7]">★</span>
              <div className="flex-1">
                <p className="text-[13.5px] leading-relaxed text-white/80">{ins.body}</p>
                {ins.importance != null && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#9aa8f0] to-[#a855f7]" style={{ width: `${ins.importance * 100}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-white/35">importance {(ins.importance * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
