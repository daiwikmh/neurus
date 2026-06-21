import type { RankedNeuron } from "../core/memory";
import { chat, chatStream } from "../llm/nvidia";
import { orChat, orChatStream } from "../llm/openrouter";

// A non-empty model routes to OpenRouter (the paid path); empty uses the free NVIDIA default.
function chatVia(model: string | undefined) {
  if (!model) return chat;
  return (system: string, user: string, opts: { maxTokens?: number; temperature?: number } = {}) => orChat(system, user, { ...opts, model });
}
function chatStreamVia(model: string | undefined) {
  if (!model) return chatStream;
  return (system: string, user: string, onToken: (t: string) => void, opts: { maxTokens?: number; temperature?: number } = {}) =>
    orChatStream(system, user, onToken, { ...opts, model });
}

const SYSTEM = `You are the user's private memory. Answer ONLY from the provided memory items.
Each item is tagged with its source, trust level, and recency.

Handle conflicts transparently — this is critical:
- If the items disagree (e.g. two different deadlines or facts), DO NOT silently pick one.
- Weigh items by authority (a stated leader/owner/decision-maker outranks a peer), trust (owned > shared > untrusted),
  and recency (a more recent item supersedes an older one).
- Give your best-supported answer, but explicitly surface the disagreement and say what would resolve it.

If the memory does not contain the answer, say you do not have it yet. Be concise.
When memory items contain code blocks, include them verbatim — do not paraphrase or summarize code.
The memory items are numbered — cite the ones you actually use with their number in square brackets, e.g. [1] or [2][3]. Do not invent citation numbers.`;

const CONVERSE_SYSTEM = `You are Neurus, the user's private memory assistant. Nothing in their stored memory is relevant to what they just said.
- If it is a greeting or small talk, reply warmly in one short sentence.
- If it is a question, say you don't have anything about that in their memory yet and invite them to add it.
- NEVER invent facts about the user, people, dates, or commitments. Keep it to 1–2 sentences. Do not list memory.`;

const docsSystem = (name: string) => `You are the documentation assistant for ${name}. Answer ONLY from the provided documentation excerpts below.
The excerpts are numbered — cite the ones you actually use with their number in square brackets, e.g. [1] or [2][3]. Do not invent citation numbers.
If the excerpts do not contain the answer, say the documentation does not cover it. Be concise and accurate; do not refer to "memory".
When excerpts contain code blocks, include them verbatim — do not paraphrase or summarize code.`;

const docsConverse = (name: string) => `You are the ${name} documentation assistant. Nothing in the documentation matches what the visitor just said.
- If it is a greeting or small talk, reply warmly in one short sentence and invite them to ask about ${name}.
- If it is a question, say the documentation does not cover that yet and suggest they rephrase or ask about a related topic.
- NEVER invent facts. Keep it to 1–2 sentences. Do not mention "memory".`;

const systemFor = (docsName?: string) => (docsName ? docsSystem(docsName) : SYSTEM);
const converseFor = (docsName?: string) => (docsName ? docsConverse(docsName) : CONVERSE_SYSTEM);

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

function buildContext(neurons: RankedNeuron[]): string {
  const now = Date.now();
  return neurons
    .map((n, i) => `[${i + 1}] (${n.neuron.title} · from ${n.neuron.source.author} · ${n.neuron.source.trust} · ${recency(n.neuron.createdAt, now)})\n${n.neuron.body}`)
    .join("\n\n");
}

const sourcesOf = (neurons: RankedNeuron[]) => [...new Set(neurons.map((n) => n.neuron.title))];

function degraded(neurons: RankedNeuron[], docsName?: string): Answer {
  const top = neurons.reduce((a, b) => (b.score > a.score ? b : a));
  const lead = docsName
    ? "I couldn't reach the model just now, but the most relevant excerpt is:"
    : "I couldn't reach the model to compose an answer just now, but the most relevant thing in your memory is:";
  return {
    text: `${lead}\n\n“${top.neuron.body}”\n\n(${top.neuron.title}) — ask again in a moment for a full answer.`,
    sources: [top.neuron.title],
  };
}

const CONVERSE_FALLBACK = "I'm having trouble reaching the model right now — try again in a moment.";
const skillBlock = (skills?: string[]) => (skills && skills.length ? `Learned procedures (apply if relevant):\n${skills.map((s) => `- ${s}`).join("\n")}\n\n` : "");
const promptFor = (question: string, neurons: RankedNeuron[], skills?: string[]) => `${skillBlock(skills)}Memory items:\n${buildContext(neurons)}\n\nQuestion: ${question}`;

export async function answer(question: string, neurons: RankedNeuron[], opts: { floor?: number; model?: string; docsName?: string; skills?: string[] } = {}): Promise<Answer> {
  const ask = chatVia(opts.model);
  if (!hasRelevantContext(neurons, opts.floor ?? FLOOR)) {
    try {
      return { text: (await ask(converseFor(opts.docsName), question, { maxTokens: 200 })).trim(), sources: [] };
    } catch {
      return { text: CONVERSE_FALLBACK, sources: [] };
    }
  }
  try {
    return { text: (await ask(systemFor(opts.docsName), promptFor(question, neurons, opts.skills))).trim(), sources: sourcesOf(neurons) };
  } catch {
    return degraded(neurons, opts.docsName);
  }
}

export async function answerStream(question: string, neurons: RankedNeuron[], onToken: (t: string) => void, opts: { model?: string; docsName?: string; skills?: string[] } = {}): Promise<Answer> {
  const ask = chatStreamVia(opts.model);
  if (!hasRelevantContext(neurons)) {
    try {
      return { text: (await ask(converseFor(opts.docsName), question, onToken, { maxTokens: 200 })).trim(), sources: [] };
    } catch {
      return { text: CONVERSE_FALLBACK, sources: [] };
    }
  }
  try {
    return { text: (await ask(systemFor(opts.docsName), promptFor(question, neurons, opts.skills), onToken)).trim(), sources: sourcesOf(neurons) };
  } catch {
    return degraded(neurons, opts.docsName);
  }
}
