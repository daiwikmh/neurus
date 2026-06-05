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

const CONVERSE_SYSTEM = `You are Neurus, the user's private memory assistant. Nothing in their stored memory is relevant to what they just said.
- If it is a greeting or small talk, reply warmly in one short sentence.
- If it is a question, say you don't have anything about that in their memory yet and invite them to add it.
- NEVER invent facts about the user, people, dates, or commitments. Keep it to 1–2 sentences. Do not list memory.`;

const FLOOR = Number(process.env.NEURUS_ASK_FLOOR ?? -5);

export interface Answer {
  text: string;
  sources: string[];
}

export function hasRelevantContext(neurons: RankedNeuron[], floor = FLOOR): boolean {
  return neurons.length > 0 && Math.max(...neurons.map((n) => n.score)) >= floor;
}

function recency(ts: number, now: number): string {
  const h = (now - ts) / 3_600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

async function converse(question: string): Promise<Answer> {
  try {
    const text = await chat(CONVERSE_SYSTEM, question, { maxTokens: 200 });
    return { text: text.trim(), sources: [] };
  } catch {
    return { text: "I'm having trouble reaching the model right now — try again in a moment.", sources: [] };
  }
}

export async function answer(question: string, neurons: RankedNeuron[]): Promise<Answer> {
  if (!hasRelevantContext(neurons)) return converse(question);
  const now = Date.now();
  const context = neurons
    .map((n) => `(${n.neuron.title} · from ${n.neuron.source.author} · ${n.neuron.source.trust} · ${recency(n.neuron.createdAt, now)})\n${n.neuron.body}`)
    .join("\n\n");
  try {
    const text = await chat(SYSTEM, `Memory items:\n${context}\n\nQuestion: ${question}`);
    return { text: text.trim(), sources: [...new Set(neurons.map((n) => n.neuron.title))] };
  } catch {
    const top = neurons.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      text: `I couldn't reach the model to compose an answer just now, but the most relevant thing in your memory is:\n\n“${top.neuron.body}”\n\n(${top.neuron.title}) — ask again in a moment for a full answer.`,
      sources: [top.neuron.title],
    };
  }
}
