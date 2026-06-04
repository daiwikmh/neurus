import { z } from "zod";
import type { Memory } from "../core/memory";
import { createNeuron, link, type Neuron } from "../core/neuron";
import { chatJSON } from "../llm/nvidia";

const Extraction = z.object({
  people: z.array(z.object({ name: z.string(), facts: z.array(z.string()).default([]) })).default([]),
  commitments: z.array(z.object({ to: z.string(), what: z.string(), due: z.string().optional() })).default([]),
  intros: z.array(z.object({ who: z.string(), by: z.string() })).default([]),
});

const SYSTEM = `Extract structured memory from a personal note. Return ONLY JSON:
{"people":[{"name":string,"facts":[string]}],"commitments":[{"to":string,"what":string,"due":string?}],"intros":[{"who":string,"by":string}]}
people = anyone mentioned, with facts/preferences about them.
commitments = ONLY things the WRITER (first person: I / me / we) personally owes or promised, to whom, and when due if stated.
A third party's wish, expectation, or deadline ("X wants it Saturday", "Y needs it Friday") is a FACT about that person, NOT a commitment — put it under people.facts, never under commitments.
intros = who was introduced by whom. Use empty arrays when none. No prose, no code fences.`;

export interface NoteResult {
  note: Neuron;
  people: Neuron[];
  commitments: Neuron[];
}

export async function ingestNote(mem: Memory, text: string, opts: { behind?: boolean } = {}): Promise<NoteResult> {
  const note = createNeuron({ type: "note", title: titleOf(text), body: text.trim() });
  await mem.remember(note, opts);

  const ex = await chatJSON(SYSTEM, text, Extraction);

  const people: Neuron[] = [];
  for (const p of ex.people) {
    const person = await mem.ensurePerson(p.name);
    if (p.facts.length) {
      person.body = mergeFacts(person.body, person.title, p.facts);
      await mem.update(person);
    }
    link(note, person.id, "about");
    people.push(person);
  }

  const commitments: Neuron[] = [];
  for (const c of ex.commitments) {
    const person = await mem.ensurePerson(c.to);
    const com = createNeuron({
      type: "commitment",
      title: `owe ${c.to}: ${c.what}`.slice(0, 60),
      body: `${c.what}${c.due ? ` (due ${c.due})` : ""}`,
      meta: { duePerson: c.to, due: c.due },
    });
    link(com, person.id, "promised_to");
    await mem.remember(com, opts);
    commitments.push(com);
  }

  for (const intro of ex.intros) {
    const who = await mem.ensurePerson(intro.who);
    const by = await mem.ensurePerson(intro.by);
    link(who, by.id, "intro_by");
    await mem.update(who);
  }

  await mem.update(note);
  return { note, people, commitments };
}

function titleOf(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 48 ? clean : clean.slice(0, 47) + "…";
}

function mergeFacts(body: string, name: string, facts: string[]): string {
  const lines = new Set(
    body.split("\n").map((l) => l.trim()).filter((l) => l && l !== name),
  );
  for (const f of facts) lines.add(f.trim());
  return [name, ...lines].join("\n");
}
