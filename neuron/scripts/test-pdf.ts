import { writeFile, rm } from "node:fs/promises";
import { ingestFile } from "../src/ingest/file";

function buildPdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 50 700 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

async function main() {
  const path = ".test-neurus.pdf";
  await writeFile(path, buildPdf("Neurus PDF parsing works the swap fee is 0.5 percent"));
  const { file, chunks } = await ingestFile(path, { store: false });
  console.log(`file: ${file.title} · mime=${file.meta?.mime} · ${file.meta?.bytes} bytes · chunks ${chunks.length}`);
  console.log(`extracted: "${chunks.map((c) => c.body).join(" ").replace(/\s+/g, " ").trim().slice(0, 70)}"`);
  const ok = chunks.some((c) => c.body.includes("Neurus PDF parsing works"));
  console.log(`PDF text extracted? ${ok ? "YES ✓" : "NO ✗"}`);
  await rm(path);
}

main().catch((e) => { console.error("❌", e.message ?? e); process.exit(1); });
