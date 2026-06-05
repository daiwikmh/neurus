"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSets } from "./components/SetContext";
import { neurus, type MapInfo } from "@/services/neurus";
import { neuronColor } from "./config";

const STEPS = [
  { n: 1, title: "Create your API key", body: "Generate a key to connect your agent to its memory.", cta: "Go to Connect", href: "/dashboard/connect" },
  { n: 2, title: "Point your agent at Neurus", body: "npm install neuron — then open a set and start remembering.", cta: "View SDK", href: "/dashboard/connect" },
  { n: 3, title: "Watch neurons appear", body: "Every memory your agent writes shows up live, on Walrus.", cta: "Open Neurons", href: "/dashboard/neurons" },
];

function Stat({ label, value, tint }: { label: string; value: string | number; tint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-wide text-white/35">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" style={tint ? { color: tint } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default function Overview() {
  const { active, online } = useSets();
  const [map, setMap] = useState<MapInfo | null>(null);

  useEffect(() => {
    if (!online) return;
    neurus.map(active).then(setMap).catch(() => setMap(null));
  }, [active, online]);

  const total = map ? Object.values(map.counts).reduce((a, b) => a + b, 0) : 0;
  const empty = !online || total === 0;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-white/45">
            Set <span className="font-mono text-white/70">{active}</span> · owned, verifiable memory on Walrus
          </p>
        </div>
        <Link href="/dashboard/ask" className="rounded-lg bg-[#9aa8f0] px-4 py-2 text-sm font-medium text-[#14152b] transition hover:bg-[#aeb9f4]">
          Ask this memory
        </Link>
      </div>

      {empty ? (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="text-lg font-semibold">Get started in 3 steps</h2>
          <p className="mt-1 text-sm text-white/45">
            {online ? "This set is empty — connect an agent or capture your first memory." : "Engine offline — run npm run api, then refresh."}
          </p>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#9aa8f0]/15 text-sm font-semibold text-[#9aa8f0]">{s.n}</span>
                <h3 className="mt-4 text-sm font-medium">{s.title}</h3>
                <p className="mt-1 flex-1 text-[13px] leading-relaxed text-white/45">{s.body}</p>
                <Link href={s.href} className="mt-4 text-[13px] text-[#9aa8f0] transition hover:text-[#bcc6ff]">
                  {s.cta} →
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-3 border-t border-white/5 pt-6 text-sm">
            <span className="text-white/40">New to Neurus?</span>
            <Link href="/dashboard/brain" className="text-[#9aa8f0] hover:text-[#bcc6ff]">
              Try the Second Brain example →
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <Stat label="neurons" value={total} />
            <Stat label="pending writes" value={map!.pending} tint={map!.pending ? "#f59e0b" : undefined} />
            <Stat label="people" value={map!.counts.person} />
            <Stat label="insights" value={map!.counts.insight} />
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-sm font-medium text-white/70">Memory composition</h2>
            <div className="mt-4 space-y-3">
              {(Object.entries(map!.counts) as [keyof typeof neuronColor, number][])
                .filter(([, v]) => v > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="w-20 text-[12px] capitalize text-white/50">{type}</span>
                    <div className="h-2.5 flex-1 rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, background: neuronColor[type] }} />
                    </div>
                    <span className="w-8 text-right text-[12px] tabular-nums text-white/60">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
