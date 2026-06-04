import { getBlobText } from "../storage/walrus";
import { createNeuron, link, type Neuron } from "../core/neuron";
import { chunkText } from "./chunk";

export interface IngestedWalrusBlob {
  source: Neuron;
  chunks: Neuron[];
}

export interface WalrusIngestOptions {
  title?: string;
  maxChars?: number;
  overlapChars?: number;
}

export async function ingestWalrusBlob(blobId: string, opts: WalrusIngestOptions = {}): Promise<IngestedWalrusBlob> {
  const text = await getBlobText(blobId);
  const title = opts.title ?? `walrus:${blobId.slice(0, 12)}`;

  const source = createNeuron({
    type: "file",
    title,
    body: summarize(text),
    blobId,
    author: "walrus",
    trust: "shared",
    meta: { origin: "walrus", blobId, bytes: text.length },
  });

  const pieces = chunkText(text, { maxChars: opts.maxChars, overlapChars: opts.overlapChars });
  const chunks = pieces.map((body, i) => {
    const c = createNeuron({
      type: "chunk",
      title: `${title}#${i + 1}`,
      body,
      author: "walrus",
      trust: "shared",
      meta: { index: i, file: source.id, blobId },
    });
    link(c, source.id, "derived_from");
    return c;
  });

  return { source, chunks };
}

function summarize(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 280 ? clean : clean.slice(0, 279) + "…";
}
