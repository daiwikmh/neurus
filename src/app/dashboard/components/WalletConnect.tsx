"use client";

import { useState } from "react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";

export function WalletConnect() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [open, setOpen] = useState(false);

  if (account) {
    const a = account.address;
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-2">
        <span className="flex items-center gap-2 text-[11px] text-white/75">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="font-mono">{a.slice(0, 6)}…{a.slice(-4)}</span>
        </span>
        <button onClick={() => disconnect()} className="shrink-0 text-[11px] text-white/40 transition hover:text-white/70">
          disconnect
        </button>
      </div>
    );
  }

  return (
    <ConnectModal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button className="w-full rounded-lg bg-[#9aa8f0] py-2 text-[12px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">
          Connect Sui wallet
        </button>
      }
    />
  );
}
