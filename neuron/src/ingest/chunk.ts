export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 1500;
  const overlap = opts.overlapChars ?? 200;
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = splitParagraphs(clean);
  const chunks: string[] = [];
  let buf = "";

  for (const p of paragraphs) {
    if (p.length > maxChars) {
      if (buf) { chunks.push(buf); buf = ""; }
      for (const piece of splitLong(p, maxChars, overlap)) chunks.push(piece);
      continue;
    }
    if (buf && buf.length + p.length + 2 > maxChars) {
      chunks.push(buf);
      buf = overlap > 0 ? tail(buf, overlap) + "\n\n" + p : p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function splitParagraphs(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (!inFence) {
        const pending = current.join("\n").trim();
        if (pending) blocks.push(pending);
        current = [line];
        inFence = true;
      } else {
        current.push(line);
        blocks.push(current.join("\n"));
        current = [];
        inFence = false;
      }
    } else if (inFence) {
      current.push(line);
    } else if (line.trim() === "") {
      const pending = current.join("\n").trim();
      if (pending) { blocks.push(pending); current = []; }
    } else {
      current.push(line);
    }
  }
  const pending = current.join("\n").trim();
  if (pending) blocks.push(pending);
  return blocks.filter(Boolean);
}

function splitLong(s: string, maxChars: number, overlap: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const end = Math.min(s.length, i + maxChars);
    out.push(s.slice(i, end).trim());
    if (end === s.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out.filter(Boolean);
}

function tail(s: string, n: number): string {
  return s.length <= n ? s : s.slice(s.length - n);
}
