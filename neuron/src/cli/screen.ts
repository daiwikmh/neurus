const out = process.stdout;
const E = "\x1b";
const ANSI = /\x1b\[[0-9;]*m/g;

let active = false;
let headerText = "";
let statusText = "";

const rows = (): number => out.rows || 24;
const cols = (): number => out.columns || 80;

export const fullscreen = (): boolean => Boolean(out.isTTY);

function clip(s: string, w: number): string {
  return s.replace(ANSI, "").length <= w ? s : s.replace(ANSI, "").slice(0, w);
}

function region(): void {
  out.write(`${E}[2;${Math.max(2, rows() - 1)}r`);
}

function draw(row: number, text: string): void {
  out.write(`${E}7${E}[${row};1H${E}[2K${clip(text, cols())}${E}[0m${E}8`);
}

export function enter(): void {
  if (!out.isTTY || active) return;
  active = true;
  out.write(`${E}[?1049h${E}[2J${E}[H`);
  region();
  out.write(`${E}[2;1H`);
  out.on("resize", refresh);
  process.on("exit", exit);
}

export function exit(): void {
  if (!active) return;
  active = false;
  out.removeListener("resize", refresh);
  out.write(`${E}[r${E}[?25h${E}[?1049l`);
}

export function setHeader(text: string): void {
  headerText = text;
  if (active) draw(1, text);
}

export function setStatus(text: string): void {
  statusText = text;
  if (active) draw(rows(), text);
}

export function refresh(): void {
  if (!active) return;
  region();
  draw(1, headerText);
  draw(rows(), statusText);
}

export function toBottom(): void {
  if (active) out.write(`${E}[${Math.max(2, rows() - 1)};1H`);
}
