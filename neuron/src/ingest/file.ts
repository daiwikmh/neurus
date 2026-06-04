import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createNeuron, link, type Neuron } from "../core/neuron";
import { chunkText } from "./chunk";
import { contextualize } from "./context";
import { putBlob } from "../storage/walrus";

const TEXT_EXT = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".log", ".text"]);
const DOC_EXT = new Set([".pdf", ".docx"]);

async function extractText(raw: Buffer, ext: string): Promise<string> {
  if (TEXT_EXT.has(ext)) return raw.toString("utf8");
  if (ext === ".pdf") {
    const { extractText: pdfExtract, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(raw));
    const { text } = await pdfExtract(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: raw });
  return value;
}

export interface IngestedFile {
  file: Neuron;
  chunks: Neuron[];
}

export interface IngestOptions {
  store?: boolean;
  epochs?: number;
  maxChars?: number;
  overlapChars?: number;
  contextual?: boolean;
}

export async function ingestFile(path: string, opts: IngestOptions = {}): Promise<IngestedFile> {
  const ext = extname(path).toLowerCase();
  if (!TEXT_EXT.has(ext) && !DOC_EXT.has(ext)) {
    throw new Error(`unsupported file type "${ext}" — text/markdown/csv/json/log/pdf/docx supported`);
  }

  const raw = await readFile(path);
  const text = await extractText(raw, ext);
  const name = basename(path);

  const blobId = opts.store === false ? undefined : await putBlob(raw, opts.epochs ?? 5);

  const file = createNeuron({
    type: "file",
    title: name,
    body: summarize(text),
    blobId,
    meta: { mime: mimeFor(ext), bytes: raw.length, ext },
  });

  const pieces = chunkText(text, { maxChars: opts.maxChars, overlapChars: opts.overlapChars });
  const contexts = opts.contextual ? await contextualize(name, pieces) : [];
  const chunks = pieces.map((body, i) => {
    const ctx = contexts[i];
    const c = createNeuron({
      type: "chunk",
      title: `${name}#${i + 1}`,
      body,
      meta: { index: i, file: file.id, ...(ctx ? { context: ctx, embedText: `${ctx}\n\n${body}` } : {}) },
    });
    link(c, file.id, "derived_from");
    return c;
  });

  return { file, chunks };
}

function summarize(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 280 ? clean : clean.slice(0, 279) + "…";
}

function mimeFor(ext: string): string {
  switch (ext) {
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "text/plain";
  }
}
