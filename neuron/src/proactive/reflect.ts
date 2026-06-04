import { z } from "zod";
import type { Memory } from "../core/memory";
import { createNeuron, link, type Neuron } from "../core/neuron";
import { chatJSON } from "../llm/nvidia";

const Reflection = z.object({
  insights: z
    .array(
      z.object({
        insight: z.string(),
        importance: z.number().min(0).max(1).default(0.5),
      }),
    )
    .default([]),
});

const SYSTEM = `You are the sleep-time reflection process of a personal memory, running while the user is away.
Given recent memories, infer a few HIGH-LEVEL insights the user would value: patterns across items, connections,
contradictions, or things that just became actionable (e.g. "several people are waiting on the same deliverable").
Do NOT restate individual facts — only synthesize. Return ONLY JSON:
{"insights":[{"insight":string,"importance":number 0..1}]}
importance = how much this deserves the user's attention (1 = urgent/valuable). Empty array if nothing rises above noise.`;

export interface ReflectResult {
  insights: Neuron[];
  consideredNeurons: number;
}

export async function reflect(mem: Memory, opts: { recent?: number } = {}): Promise<ReflectResult> {
  await mem.ready();
  const source = mem.all().filter((n) => n.type !== "insight" && n.type !== "chunk");
  const recent = source.sort((a, b) => b.createdAt - a.createdAt).slice(0, opts.recent ?? 30);
  if (recent.length === 0) return { insights: [], consideredNeurons: 0 };

  const context = recent.map((n) => `(${n.type}) ${n.body}`).join("\n");
  const ref = await chatJSON(SYSTEM, `Recent memories:\n${context}`, Reflection);

  const insights: Neuron[] = [];
  for (const it of ref.insights) {
    const ins = createNeuron({
      type: "insight",
      title: it.insight.slice(0, 60),
      body: it.insight,
      meta: { importance: it.importance, reflectedAt: Date.now() },
    });
    for (const src of recent) link(ins, src.id, "reflects_on");
    await mem.remember(ins);
    insights.push(ins);
  }
  return { insights, consideredNeurons: recent.length };
}
