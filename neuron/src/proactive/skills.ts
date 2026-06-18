import type { Memory } from "../core/memory";
import { createNeuron, type Neuron } from "../core/neuron";
import { chat } from "../llm/nvidia";

export interface Episode {
  taskKind: string;
  action: string;
  outcome: string;
  success: boolean;
  context?: string;
}

export interface SkillStats {
  uses: number;
  wins: number;
  losses: number;
  confidence: number;
}

const RECENT_CAP = 8;

const SKILL_SYSTEM = `You distill a REUSABLE PROCEDURE from past attempts at the same kind of task and their outcomes.
Write 2-4 short imperative sentences: the trigger condition and the action that correlated with SUCCESS, and what to avoid given FAILURES.
Prefer what worked. Do not restate individual episodes or invent facts. No preamble.`;

const skillTitle = (taskKind: string) => `skill: ${taskKind}`;

function nextStats(prev: SkillStats | undefined, success: boolean): SkillStats {
  const wins = (prev?.wins ?? 0) + (success ? 1 : 0);
  const losses = (prev?.losses ?? 0) + (success ? 0 : 1);
  return { uses: (prev?.uses ?? 0) + 1, wins, losses, confidence: wins / (wins + losses) };
}

async function composeBody(taskKind: string, recent: Episode[], existingBody?: string): Promise<string> {
  const ctx = recent.map((e) => `[${e.success ? "WIN" : "LOSS"}] ${e.action} -> ${e.outcome}`).join("\n");
  const user = `Task kind: ${taskKind}\nPast attempts:\n${ctx}${existingBody ? `\n\nCurrent procedure (refine it):\n${existingBody}` : ""}`;
  try {
    return (await chat(SKILL_SYSTEM, user, { maxTokens: 200 })).trim() || existingBody || ctx;
  } catch {
    return existingBody || ctx;
  }
}

function findSkill(mem: Memory, taskKind: string): Neuron | undefined {
  return mem.all().find((n) => n.type === "skill" && n.meta?.taskKind === taskKind);
}

// act -> outcome -> distill: record one attempt and (re)write the procedure for its task kind.
export async function learn(mem: Memory, ep: Episode): Promise<Neuron> {
  await mem.ready();
  const existing = findSkill(mem, ep.taskKind);
  const stats = nextStats(existing?.meta?.stats as SkillStats | undefined, ep.success);
  const recent = [...((existing?.meta?.recent as Episode[] | undefined) ?? []), ep].slice(-RECENT_CAP);
  const body = await composeBody(ep.taskKind, recent, existing?.body);
  const meta = { kind: "skill", taskKind: ep.taskKind, stats, recent, updatedAt: Date.now() };

  if (existing) {
    existing.body = body;
    existing.title = skillTitle(ep.taskKind);
    existing.meta = { ...existing.meta, ...meta };
    return mem.remember(existing);
  }
  return mem.remember(createNeuron({ type: "skill", title: skillTitle(ep.taskKind), body, author: "self", meta }));
}

// retrieve-before-act: the procedures to apply to an upcoming task of this kind, best first.
export async function primeSkills(mem: Memory, taskKind: string, limit = 2): Promise<Neuron[]> {
  await mem.ready();
  return mem
    .all()
    .filter((n) => n.type === "skill" && n.meta?.taskKind === taskKind)
    .sort((a, b) => ((b.meta?.stats as SkillStats)?.confidence ?? 0) - ((a.meta?.stats as SkillStats)?.confidence ?? 0))
    .slice(0, limit);
}
