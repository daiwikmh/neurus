import { z } from "zod";
import { chatJSON } from "../llm/nvidia";

const Ctx = z.object({
  contexts: z.array(z.object({ index: z.number(), context: z.string() })).default([]),
});

const SYSTEM = `You situate document chunks for retrieval. Given a whole document and its numbered chunks,
write for EACH chunk a single short sentence (max 25 words) that states what part of the document it is from and
what it concerns, so the chunk is findable on its own. Do not summarize the chunk's content verbatim; add the
missing context (section, subject, entity). Return ONLY JSON: {"contexts":[{"index":number,"context":string}]}.`;

export async function contextualize(docTitle: string, chunks: string[]): Promise<string[]> {
  if (chunks.length === 0) return [];
  const doc = chunks.map((c, i) => `[chunk ${i}]\n${c}`).join("\n\n");
  try {
    const res = await chatJSON(SYSTEM, `Document: ${docTitle}\n\n${doc}`, Ctx);
    const map = new Map(res.contexts.map((c) => [c.index, c.context.trim()]));
    return chunks.map((_, i) => map.get(i) ?? "");
  } catch {
    return chunks.map(() => "");
  }
}
