"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useDisconnectWallet } from "@mysten/dapp-kit";
import { useSets } from "./SetContext";
import { TelegramConnect } from "./TelegramConnect";
import { WalletOwnership } from "./WalletOwnership";

const user = {
  name: "Daiwik",
};

function Avatar({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#9aa8f0] to-[#a855f7] font-semibold text-[#14152b]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {user.name[0]}
    </span>
  );
}

export function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { active } = useSets();
  const { mutateAsync: disconnect } = useDisconnectWallet();
  const router = useRouter();

  const handleSignOut = async () => {
    setOpen(false);
    try {
      await disconnect();
    } catch {
      /* no wallet connected */
    }
    await signOut({ redirect: false });
    router.replace("/login");
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest?.("[data-dapp-kit]")) return;
      if (ref.current && !ref.current.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative border-t border-white/10 p-3">
      {open && (
        <div className="absolute bottom-[calc(100%+6px)] left-3 right-3 z-20 overflow-hidden rounded-xl border border-white/10 bg-[#121319] shadow-2xl shadow-black/50">
          <div className="border-b border-white/10 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <Avatar size={34} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{user.name}</div>
              </div>
            </div>
          </div>
          <div className="border-b border-white/10 px-3.5 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/35">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#9aa8f0]"><path d="M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h.01" /></svg>
              Sui wallet
            </div>
            <WalletOwnership />
          </div>
          <div className="border-b border-white/10 px-3.5 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/35">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-[#26a5e4]"><path d="M21.94 4.6 18.9 19.2c-.23 1-.83 1.26-1.68.78l-4.64-3.42-2.24 2.16c-.25.25-.46.46-.94.46l.33-4.73 8.6-7.77c.37-.33-.08-.52-.58-.19L7.43 13.4l-4.57-1.43c-.99-.31-1.01-.99.21-1.47l17.86-6.88c.83-.3 1.55.19 1.01 1.48z"/></svg>
              Telegram alerts
            </div>
            <TelegramConnect set={active} compact />
          </div>
          <div className="py-1">
            <button
              onClick={handleSignOut}
              className="block w-full px-3.5 py-2 text-left text-[13px] text-red-400 transition hover:bg-white/[0.05]"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        title={collapsed ? user.name : undefined}
        className={`flex w-full items-center rounded-lg py-1.5 transition hover:bg-white/[0.05] ${collapsed ? "justify-center px-0" : "gap-2.5 px-2"}`}
      >
        <Avatar />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13px] font-medium text-white">{user.name}</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-white/40">
              <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
