"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { dashboardNav } from "../config";
import { useSets } from "./SetContext";
import { ProfileMenu } from "./ProfileMenu";

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    pulse: "M3 12h4l2 6 4-14 2 8h6",
    spark: "M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2",
    brain: "M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 17a3 3 0 0 0 5 1 3 3 0 0 0 5-1 3 3 0 0 0 2-5.2A3 3 0 0 0 18 6a3 3 0 0 0-3-3 3 3 0 0 0-3 1.5A3 3 0 0 0 9 3z",
    layers: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    plug: "M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6",
    database: "M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
    network: "M9 5a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM2 19a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM16 19a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM11 8 6.5 16M13 8 17.5 16",
    agents: "M12 2v3M7 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 13h.01M15 13h.01M9 17h6",
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[20px] w-[20px] shrink-0">
      <path d={paths[name]} />
    </svg>
  );
}

function SetSwitcher({ collapsed }: { collapsed: boolean }) {
  const { sets, active, setActive, online } = useSets();
  if (collapsed) {
    return (
      <div className="flex justify-center px-2 py-3" title={`set: ${active}`}>
        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-red-500"}`} />
      </div>
    );
  }
  return (
    <div className="px-3 pb-3 pt-4">
      <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] uppercase tracking-[0.15em] text-white/30">
        <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-500"}`} />
        {online ? "engine online" : "engine offline"}
      </div>
      <select
        value={active}
        onChange={(e) => setActive(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-sm text-white outline-none focus:border-[#9aa8f0]/50"
      >
        {(sets.length ? sets.map((s) => s.name) : ["default"]).map((n) => (
          <option key={n} value={n} className="bg-[#0c0d10]">
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("neurus.sidebar") === "1");
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("neurus.sidebar", next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside className={`relative flex shrink-0 flex-col border-r border-white/10 bg-[#0a0b0e] transition-[width] duration-200 ${collapsed ? "w-16" : "w-60"}`}>
      <div className={`flex items-center py-4 ${collapsed ? "justify-center px-0" : "justify-between px-5"}`}>
        <Link href="/" className="flex items-center gap-2">
          <Image src="/neurus.png" alt="Neurus" width={28} height={28} />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Neurus</span>}
        </Link>
      </div>

      <SetSwitcher collapsed={collapsed} />

      <nav className={`flex-1 space-y-0.5 ${collapsed ? "px-2" : "px-3"}`}>
        {dashboardNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg py-2 text-[13.5px] transition ${collapsed ? "justify-center px-0" : "px-3"} ${
                isActive ? "bg-white/[0.07] text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
              }`}
            >
              <Icon name={item.icon} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <ProfileMenu collapsed={collapsed} />

      <button
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-16 grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-[#14151a] text-white/50 transition hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    </aside>
  );
}
