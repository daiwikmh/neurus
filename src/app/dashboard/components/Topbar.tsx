"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNav } from "../config";
import { useSets } from "./SetContext";

function pageInfo(pathname: string) {
  const match = dashboardNav.find((n) => n.href === pathname);
  return match?.label ?? "Overview";
}

function IconBtn({ title, d, href }: { title: string; d: string; href?: string }) {
  const inner = (
    <span title={title} className="grid h-8 w-8 place-items-center rounded-lg text-white/45 transition hover:bg-white/[0.06] hover:text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
        <path d={d} />
      </svg>
    </span>
  );
  return href ? <Link href={href}>{inner}</Link> : <button>{inner}</button>;
}

export function Topbar() {
  const pathname = usePathname();
  const { active, sets } = useSets();
  const page = pageInfo(pathname);
  const setId = sets.find((s) => s.name === active)?.id ?? "—";

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0c0f]/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-white/40">{active}</span>
          <span className="text-white/20">/</span>
          <span className="font-medium text-white">{page}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-white/40 sm:flex">
            <span className="text-white/25">SET</span>
            {setId}
          </span>
          <button className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-white/40 transition hover:border-white/20 hover:text-white/70 sm:flex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            Search
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/40">⌘K</kbd>
          </button>
          <IconBtn title="Docs" d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <IconBtn title="Help" href="#" d="M9.1 9a3 3 0 1 1 4.5 2.6c-.9.5-1.6 1.2-1.6 2.4M12 17h.01" />
        </div>
      </div>

      <div className="px-6 pb-3">
        <Link
          href="/dashboard/ask"
          className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-white/40 transition hover:border-[#9aa8f0]/40 hover:text-white/70"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[#9aa8f0]">
            <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2" />
          </svg>
          Ask {active} anything — recall by meaning, grounded &amp; cited…
        </Link>
      </div>
    </header>
  );
}
