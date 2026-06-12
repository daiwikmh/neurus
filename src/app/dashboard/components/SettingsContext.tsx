"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { neurus, type BillingStatus } from "@/services/neurus";
import { btnGhost, btnPrimary } from "./ui";

const FREE_MODEL = "openai/gpt-oss-120b";

interface ModelDef {
  id: string;
  provider: string;
}

const PAID_MODELS: ModelDef[] = [
  { id: "minimax/minimax-m3", provider: "MiniMax" },
  { id: "tencent/hy3-preview", provider: "Tencent" },
  { id: "deepseek/deepseek-v4-flash", provider: "DeepSeek" },
  { id: "google/gemini-3-flash-preview", provider: "Google" },
];

function providerOf(id: string): string {
  if (id === FREE_MODEL) return "NVIDIA";
  return PAID_MODELS.find((m) => m.id === id)?.provider ?? "OpenRouter";
}

interface Ctx {
  model: string;
  provider: string;
  isDefault: boolean;
  askModel: string | undefined;
  paid: boolean;
  openSettings: () => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [model, setModelState] = useState(FREE_MODEL);
  const [paid, setPaid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("neurus.llm.model");
    neurus
      .billingStatus()
      .then((s) => {
        setPaid(s.paid);
        if (stored && stored !== FREE_MODEL && s.paid) setModelState(stored);
        else setModelState(FREE_MODEL);
      })
      .catch(() => setModelState(FREE_MODEL));
  }, []);

  const setModel = (id: string) => {
    setModelState(id);
    localStorage.setItem("neurus.llm.model", id);
  };

  const isDefault = model === FREE_MODEL;

  return (
    <SettingsCtx.Provider
      value={{ model, provider: providerOf(model), isDefault, askModel: isDefault ? undefined : model, paid, openSettings: () => setOpen(true) }}
    >
      {children}
      {open && (
        <SettingsModal
          model={model}
          paid={paid}
          setModel={setModel}
          setPaid={setPaid}
          onClose={() => setOpen(false)}
        />
      )}
    </SettingsCtx.Provider>
  );
}

function SettingsModal({
  model,
  paid,
  setModel,
  setPaid,
  onClose,
}: {
  model: string;
  paid: boolean;
  setModel: (id: string) => void;
  setPaid: (v: boolean) => void;
  onClose: () => void;
}) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);

  useEffect(() => {
    neurus.billingStatus().then(setBilling).catch(() => setBilling(null));
  }, []);

  const pick = (id: string) => {
    if (id !== FREE_MODEL && !paid) {
      setMsg("Unlock premium models first.");
      return;
    }
    setModel(id);
    setDropOpen(false);
  };

  const unlock = async () => {
    if (!account) { setMsg("Connect a Sui wallet to pay."); return; }
    if (!billing?.configured || !billing.treasury || !billing.priceSui) {
      setMsg("Payments aren't configured on the server yet.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const mist = Math.ceil(billing.priceSui * 1_000_000_000);
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [mist]);
      tx.transferObjects([coin], billing.treasury);
      const res = await signAndExecute({ transaction: tx as any });
      const digest = (res as any).digest as string;
      setMsg("Payment sent — verifying on-chain…");
      let verified = false;
      for (let i = 0; i < 4 && !verified; i++) {
        try {
          const r = await neurus.billingVerify(digest);
          if (r.paid) verified = true;
        } catch {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      if (verified) {
        setPaid(true);
        setMsg("Unlocked. All models are now available.");
      } else {
        setMsg("Couldn't confirm the payment yet. If it went through, reopen settings in a moment.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const priceLabel = billing?.priceSui
    ? `${billing.priceSui.toFixed(3)} SUI (~$${billing.priceUsd})`
    : `$${billing?.priceUsd ?? 5}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d12] shadow-2xl shadow-black/50" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Model</h2>
            <p className="mt-0.5 text-[12px] text-white/40">The model used to answer your asks</p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-white/40 transition hover:bg-white/[0.06] hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-5">
          <span className="text-[11px] uppercase tracking-wide text-white/35">Model</span>
          <div className="relative mt-1.5">
            <button
              onClick={() => setDropOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-white/20"
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-[13px] text-white/90">{model}</span>
                <span className="text-[11px] text-white/40">
                  {providerOf(model)}{model === FREE_MODEL ? " · free default" : " · premium"}
                </span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${dropOpen ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {dropOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#121319] p-1 shadow-2xl shadow-black/50">
                <Option id={FREE_MODEL} provider="NVIDIA" free selected={model === FREE_MODEL} locked={false} onPick={pick} />
                <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-white/30">Premium {paid ? "· unlocked" : "· locked"}</div>
                {PAID_MODELS.map((m) => (
                  <Option key={m.id} id={m.id} provider={m.provider} selected={model === m.id} locked={!paid} onPick={pick} />
                ))}
              </div>
            )}
          </div>
        </div>

        {!paid && (
          <div className="border-t border-white/10 px-5 py-4">
            <div className="text-[12.5px] text-white/55">
              Unlock every model for a one-time <span className="text-white">{priceLabel}</span>, paid from your Sui wallet. Beta.
            </div>
            <button onClick={unlock} disabled={busy} className={`mt-3 w-full ${btnPrimary}`}>
              {busy ? "Processing…" : `Unlock — pay ${priceLabel}`}
            </button>
          </div>
        )}

        {msg && <div className="border-t border-white/10 px-5 py-3 text-[12px] text-white/55">{msg}</div>}

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button onClick={onClose} className={btnGhost}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Option({
  id,
  provider,
  free,
  selected,
  locked,
  onPick,
}: {
  id: string;
  provider: string;
  free?: boolean;
  selected: boolean;
  locked: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(id)}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition hover:bg-white/[0.06] ${locked ? "opacity-50" : ""}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-[12.5px] text-white/85">{id}</span>
        <span className="text-[11px] text-white/40">{provider}</span>
      </span>
      <span className="ml-2 shrink-0">
        {free ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">Free</span>
        ) : locked ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-white/35"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        ) : selected ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[#9aa8f0]"><path d="M20 6 9 17l-5-5" /></svg>
        ) : null}
      </span>
    </button>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings outside SettingsProvider");
  return ctx;
}
