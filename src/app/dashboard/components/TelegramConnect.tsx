"use client";

import { useEffect, useRef, useState } from "react";
import { neurus } from "@/services/neurus";

export function TelegramConnect({ set, compact = false }: { set: string; compact?: boolean }) {
  const [chatId, setChatId] = useState("");
  const [connected, setConnected] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
  };

  useEffect(() => {
    neurus.notifyConfig(set).then((c) => setConnected(c.telegram?.chatId ?? null)).catch(() => {});
    return stopPoll;
  }, [set]);

  const link = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await neurus.linkTelegram(set);
      if (!r.configured || !r.url) {
        setShowManual(true);
        setStatus(r.error ?? "Telegram bot not configured on the server — paste your chat ID instead.");
        return;
      }
      window.open(r.url, "_blank", "noopener");
      setStatus("Opened Telegram — press Start there, then come back.");
      stopPoll();
      let waited = 0;
      poll.current = setInterval(async () => {
        waited += 3;
        try {
          const c = await neurus.notifyConfig(set);
          if (c.telegram?.chatId) {
            setConnected(c.telegram.chatId);
            setStatus("Connected ✓");
            stopPoll();
          }
        } catch { /* keep waiting */ }
        if (waited >= 120) { setStatus("Didn't detect a connection — try again or paste your chat ID."); stopPoll(); }
      }, 3000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const connectManual = async () => {
    if (!chatId.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const c = await neurus.connectTelegram(set, chatId.trim());
      setConnected(c.telegram?.chatId ?? null);
      setChatId("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await neurus.testNotify(set);
      setStatus(r.delivered.length ? "sent ✓ — check Telegram" : r.skipped[0] ?? "nothing delivered");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const pad = compact ? "px-2.5 py-2" : "px-3.5 py-2.5";
  const txt = compact ? "text-[11px]" : "text-[12.5px]";

  return (
    <div className="space-y-2.5">
      {!compact && (
        <p className="text-[12.5px] text-white/40">
          Get nudges and monitor alerts in Telegram. Connect in one tap — we&apos;ll open the bot and link this account automatically.
        </p>
      )}
      {connected ? (
        <div className={`flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] ${pad}`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className={`truncate ${txt} text-white/75`}>
            Connected · <span className="font-mono text-white/55">{connected}</span>
          </span>
        </div>
      ) : null}

      <div className={compact ? "flex flex-col gap-2" : "flex gap-2"}>
        <button
          onClick={link}
          disabled={busy}
          className={`rounded-lg bg-[#9aa8f0] ${compact ? "w-full py-2" : "px-4 py-2.5"} text-sm font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40`}
        >
          {connected ? "Reconnect Telegram" : "Connect with Telegram"}
        </button>
        {connected ? (
          <button
            onClick={test}
            disabled={busy}
            className={`rounded-lg border border-white/15 ${compact ? "w-full py-2" : "px-4 py-2.5"} text-sm text-white/75 transition hover:border-white/30 disabled:opacity-40`}
          >
            Send test
          </button>
        ) : null}
      </div>

      {!connected ? (
        <button onClick={() => setShowManual((v) => !v)} className={`${txt} text-white/35 underline-offset-2 hover:text-white/55 hover:underline`}>
          {showManual ? "hide manual entry" : "enter chat ID manually"}
        </button>
      ) : null}

      {showManual && !connected ? (
        <div className={compact ? "flex flex-col gap-2" : "flex gap-2"}>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="Telegram chat ID (from @userinfobot)"
            className={`flex-1 rounded-lg border border-white/10 bg-[#0c0d10] ${pad} font-mono ${txt} text-white/80 outline-none placeholder:text-white/25 focus:border-white/25`}
          />
          <button
            onClick={connectManual}
            disabled={busy || !chatId.trim()}
            className={`rounded-lg border border-white/15 ${compact ? "py-2" : "px-4 py-2.5"} text-sm text-white/75 transition hover:border-white/30 disabled:opacity-40`}
          >
            Connect
          </button>
        </div>
      ) : null}

      {status ? <p className={`${txt} text-white/45`}>{status}</p> : null}
    </div>
  );
}
