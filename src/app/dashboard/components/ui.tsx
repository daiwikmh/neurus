import type { ReactNode } from "react";

export const fieldCls = "rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#9aa8f0]/50 disabled:opacity-50";

export const btnPrimary = "rounded-lg bg-[#9aa8f0] px-4 py-2 text-[13px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40";
export const btnPrimarySm = "rounded-md bg-[#9aa8f0] px-3 py-1.5 text-[12.5px] font-medium text-[#14152b] transition hover:bg-[#aeb9f4] disabled:opacity-40";
export const btnGhost = "rounded-lg border border-white/15 px-4 py-2 text-[13px] text-white/70 transition hover:bg-white/[0.06]";
export const btnGhostSm = "rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[12px] text-white/80 transition hover:bg-white/10";
export const btnDanger = "rounded-lg border border-red-400/40 px-4 py-2 text-[13px] text-red-300 transition hover:bg-red-500/10";
export const btnDangerSm = "rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1 text-[12px] text-red-300 transition hover:bg-red-500/20";

export const panelCls = "rounded-2xl border border-white/10 bg-[#08090c]";
export const microLabel = "text-[11px] uppercase tracking-[0.12em] text-white/35";

export function Section({ label }: { label: string }) {
  return <div className="mb-2 mt-7 text-[11px] uppercase tracking-[0.16em] text-white/30">{label}</div>;
}

export function Card({
  title,
  sub,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  if (collapsible && title) {
    return (
      <details open={defaultOpen} className={`group rounded-2xl border border-white/10 bg-white/[0.02] p-5 ${className}`}>
        <summary className="flex cursor-pointer list-none items-start justify-between marker:content-none [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="text-sm font-medium text-white/80">{title}</h2>
            {sub && <p className="mt-1 hidden text-[12.5px] leading-relaxed text-white/40 group-open:block">{sub}</p>}
          </div>
          <svg viewBox="0 0 12 12" className="ml-3 mt-1 h-3 w-3 shrink-0 text-white/30 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        {children}
      </details>
    );
  }
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.02] p-5 ${className}`}>
      {title && <h2 className="text-sm font-medium text-white/80">{title}</h2>}
      {sub && <p className="mt-1 text-[12.5px] leading-relaxed text-white/40">{sub}</p>}
      {children}
    </div>
  );
}

export function Labeled({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] uppercase tracking-wide text-white/35">{label}</span>
      {children}
    </label>
  );
}

export function Dot({ color, className = "h-2 w-2" }: { color: string; className?: string }) {
  return <span className={`shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}
