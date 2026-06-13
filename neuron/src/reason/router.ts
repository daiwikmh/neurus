import type { Neurus } from "../index";
import type { RankedNeuron } from "../core/memory";
import { createNeuron } from "../core/neuron";
import { orChat } from "../llm/openrouter";
import { chat as nvidiaChat } from "../llm/nvidia";

export interface RouteResult {
  text: string;
  model: string;
  usedContext: { by: string; text: string }[];
}

const ROUTER_SYSTEM = `You are ONE model in a multi-model working session that shares ONE memory.
Earlier turns may have been produced by DIFFERENT models (e.g. Claude, Gemini, GPT). Treat them as your own prior context: stay consistent with every decision, name, value, style, and fact already established — never contradict or silently re-invent them. Do your part of the work, then state any concrete new decisions explicitly (a name, a color, a value) so the next model can build on them. Be concise.`;

function provenance(hits: RankedNeuron[]): string {
  return hits
    .map((h, i) => `[${i + 1}] (by ${(h.neuron.meta?.model as string) ?? "user"}) ${h.neuron.body.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

export async function routeTurn(
  host: Neurus,
  opts: { session: string; message: string; model?: string; limit?: number },
): Promise<RouteResult> {
  const hits = await host.recall(opts.message, { limit: opts.limit ?? 8 });
  const context = hits.length ? provenance(hits) : "(no prior session context yet — you are the first model)";
  const prompt = `Shared session memory so far:\n${context}\n\nYour task now:\n${opts.message}`;

  const label = opts.model ?? "nvidia-default";
  const text = (
    opts.model
      ? await orChat(ROUTER_SYSTEM, prompt, { model: opts.model, maxTokens: 500 })
      : await nvidiaChat(ROUTER_SYSTEM, prompt, { maxTokens: 500 })
  ).trim();

  const ts = Date.now();
  const tag = (role: string, model: string) => ({ session: opts.session, role, model, ts });
  await host.memory.remember(
    createNeuron({ type: "note", title: `${opts.session} · user`, body: opts.message, meta: tag("user", "user") }),
  );
  await host.memory.remember(
    createNeuron({ type: "note", title: `${opts.session} · ${label}`, body: text, meta: tag("assistant", label) }),
  );

  return { text, model: label, usedContext: hits.map((h) => ({ by: (h.neuron.meta?.model as string) ?? "user", text: h.neuron.body })) };
}
