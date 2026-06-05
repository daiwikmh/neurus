"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const user = {
  name: "Daiwik",
  email: "daiwik@neurus.dev",
  plan: "Starter",
};

const menu = [
  { label: "Account settings", href: "/dashboard/connect" },
  { label: "API keys", href: "/dashboard/connect" },
  { label: "Documentation", href: "#" },
  { label: "Sign out", href: "/", danger: true },
];

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

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
                <div className="truncate text-[11px] text-white/40">{user.email}</div>
              </div>
            </div>
            <span className="mt-2.5 inline-block rounded-full bg-[#9aa8f0]/15 px-2 py-0.5 text-[10px] font-medium text-[#9aa8f0]">{user.plan} plan</span>
          </div>
          <div className="py-1">
            {menu.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                onClick={() => setOpen(false)}
                className={`block px-3.5 py-2 text-[13px] transition hover:bg-white/[0.05] ${m.danger ? "text-red-400" : "text-white/70"}`}
              >
                {m.label}
              </Link>
            ))}
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
              <div className="truncate text-[11px] text-white/40">{user.email}</div>
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
