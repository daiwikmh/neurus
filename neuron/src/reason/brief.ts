import type { Memory } from "../core/memory";
import type { Neuron } from "../core/neuron";
import { chat } from "../llm/nvidia";

const SYSTEM = `You are the user's private memory. Write a short pre-meeting brief about a person using ONLY the provided memory.
Cover, as tight bullets: who they are, key facts/preferences, and open loops (anything owed or promised).
If the memory is thin, say so plainly. Do not invent anything not in the memory.`;

export interface Brief {
  person: string;
  text: string;
  sources: number;
}

export async function brief(mem: Memory, name: string): Promise<Brief> {
  await mem.ready();
  const person = mem.findPerson(name);
  if (!person) return { person: name, text: `No memory of ${name} yet.`, sources: 0 };

  const related = mem.neighbors(person.id);
  const recalled = (await mem.recall(name, { limit: 5 })).map((r) => r.neuron);

  const byId = new Map<string, Neuron>();
  for (const n of [person, ...related, ...recalled]) byId.set(n.id, n);
  const neurons = [...byId.values()];

  const context = neurons.map((n) => `(${n.type}: ${n.title})\n${n.body}`).join("\n\n");
  const text = await chat(SYSTEM, `Person: ${person.title}\n\nMemory:\n${context}\n\nWrite the brief.`);
  return { person: person.title, text: text.trim(), sources: neurons.length };
}
