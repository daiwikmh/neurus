import type { RankedNeuron } from "../core/memory";
import { chat } from "../llm/nvidia";

const SYSTEM = `You are the user's private memory. Answer ONLY from the provided memory items.
Each item is tagged with its source, trust level, and recency.

Handle conflicts transparently — this is critical:
- If the items disagree (e.g. two different deadlines or facts), DO NOT silently pick one.
- Weigh items by authority (a stated leader/owner/decision-maker outranks a peer), trust (owned > shared > untrusted),
  and recency (a more recent item supersedes an older one).
- Give your best-supported answer, but explicitly surface the disagreement and say what would resolve it.

If the memory does not contain the answer, say you do not have it yet. Be concise. Cite source titles in brackets.`;

export interface Answer {
  text: string;
  sources: string[];
}

function recency(ts: number, now: number): string {
  const h = (now - ts) / 3_600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export async function answer(question: string, neurons: RankedNeuron[]): Promise<Answer> {
  if (neurons.length === 0) {
    return { text: "I don't have anything about that in your memory yet.", sources: [] };
  }
  const now = Date.now();
  const context = neurons
    .map((n) => `(${n.neuron.title} · from ${n.neuron.source.author} · ${n.neuron.source.trust} · ${recency(n.neuron.createdAt, now)})\n${n.neuron.body}`)
    .join("\n\n");
  const text = await chat(SYSTEM, `Memory items:\n${context}\n\nQuestion: ${question}`);
  return { text: text.trim(), sources: [...new Set(neurons.map((n) => n.neuron.title))] };
}
