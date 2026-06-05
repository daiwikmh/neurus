"use client";

import { useEffect, useState } from "react";
import { useSets } from "../components/SetContext";
import { API_BASE, neurus } from "@/services/neurus";

function TelegramConnect({ set }: { set: string }) {
  const [chatId, setChatId] = useState("");
  const [connected, setConnected] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    neurus.notifyConfig(set).then((c) => setConnected(c.telegram?.chatId ?? null)).catch(() => {});
  }, [set]);

  const connect = async () => {
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

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-white/40">
        Get nudges and monitor alerts in Telegram. Message{" "}
        <span className="font-mono text-white/60">@userinfobot</span> to get your chat ID, then paste it here.
      </p>
      {connected ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-white/75">Connected · chat <span className="font-mono text-white/55">{connected}</span></span>
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="Telegram chat ID, e.g. 123456789"
          className="flex-1 rounded-lg border border-white/10 bg-[#0c0d10] px-3.5 py-2.5 font-mono text-[12.5px] text-white/80 outline-none placeholder:text-white/25 focus:border-white/25"
        />
        <button
          onClick={connect}
          disabled={busy || !chatId.trim()}
          className="rounded-lg bg-[#9aa8f0] px-4 py-2.5 text-sm font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40"
        >
          {connected ? "Update" : "Connect"}
        </button>
        {connected ? (
          <button
            onClick={test}
            disabled={busy}
            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/75 transition hover:border-white/30 disabled:opacity-40"
          >
            Send test
          </button>
        ) : null}
      </div>
      {status ? <p className="text-[12.5px] text-white/45">{status}</p> : null}
    </div>
  );
}

function Copyable({ text, mono = true }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      onClick={copy}
      className={`group flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0c0d10] px-3.5 py-2.5 text-left transition hover:border-white/25 ${mono ? "font-mono text-[12.5px]" : "text-sm"}`}
    >
      <span className="truncate text-white/75">{text}</span>
      <span className="shrink-0 text-[11px] text-white/35 group-hover:text-white/60">{copied ? "copied ✓" : "copy"}</span>
    </button>
  );
}

function Block({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-[#0c0d10] p-4 font-mono text-[12.5px] leading-[1.7] text-white/80">
      <code>{children}</code>
    </pre>
  );
}

function Card({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#9aa8f0]/15 text-sm font-semibold text-[#9aa8f0]">{step}</span>
        <h2 className="text-base font-medium">{title}</h2>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

export default function ConnectPage() {
  const { active } = useSets();
  const apiKey = "neu_sk_live_8f2a4c91d6e0b7a3";

  const sdk = `import { Neurus } from "neuron";

const mem = await Neurus.open("${active}");

await mem.note("Sarah is allergic to shellfish. I owe her the deck Friday.");
const answer = await mem.ask("what do I owe Sarah, and when?");
console.log(answer.text);`;

  const curl = `curl -X POST ${API_BASE}/v1/ask \\
  -H "content-type: application/json" \\
  -d '{"set":"${active}","question":"what do I owe Sarah?"}'`;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Connect</h1>
      <p className="mt-1 text-sm text-white/45">Point any agent at Neurus — its memory is owned, encrypted, and verifiable on Walrus.</p>

      <div className="mt-8 space-y-5">
        <Card step={1} title="Your API key">
          <Copyable text={apiKey} />
          <p className="text-[12.5px] text-white/40">Keep it secret. This key authorizes reads and writes to your sets.</p>
        </Card>

        <Card step={2} title="Install & connect the SDK">
          <Copyable text="npm install neuron" />
          <Block>{sdk}</Block>
        </Card>

        <Card step={3} title="Or call the HTTP API directly">
          <p className="text-[12.5px] text-white/40">Any language — the engine speaks plain JSON.</p>
          <Block>{curl}</Block>
        </Card>

        <Card step={4} title="Endpoint">
          <Copyable text={`${API_BASE}/v1`} />
          <p className="text-[12.5px] text-white/40">
            Local engine by default. Set <span className="font-mono text-white/60">NEXT_PUBLIC_NEURUS_API</span> to point the dashboard at a hosted engine.
          </p>
        </Card>

        <Card step={5} title="Connect Telegram">
          <TelegramConnect set={active} />
        </Card>
      </div>
    </div>
  );
}
