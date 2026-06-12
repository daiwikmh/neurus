const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  dim: wrap("2"),
  bold: wrap("1"),
  cyan: wrap("36"),
  green: wrap("32"),
  red: wrap("31"),
  yellow: wrap("33"),
  magenta: wrap("35"),
  blue: wrap("34"),
};

const ANSI = /\x1b\[[0-9;]*m/g;
const vlen = (s: string) => s.replace(ANSI, "").length;
const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - vlen(s)));

export function banner(): void {
  const art = [
    "  ███╗   ██╗███████╗██╗   ██╗██████╗ ██╗   ██╗███████╗",
    "  ████╗  ██║██╔════╝██║   ██║██╔══██╗██║   ██║██╔════╝",
    "  ██╔██╗ ██║█████╗  ██║   ██║██████╔╝██║   ██║███████╗",
    "  ██║╚██╗██║██╔══╝  ██║   ██║██╔══██╗██║   ██║╚════██║",
    "  ██║ ╚████║███████╗╚██████╔╝██║  ██║╚██████╔╝███████║",
    "  ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
  ];
  console.log("");
  for (const l of art) console.log(c.cyan(l));
  console.log(c.dim("  cross-user memory sharing · Seal-gated, custodian-blind, on Walrus"));
  console.log("");
}

export function box(title: string, lines: string[]): void {
  const inner = Math.max(vlen(title) + 2, ...lines.map(vlen), 40);
  const top = `╭─ ${c.bold(title)} ${"─".repeat(Math.max(0, inner - vlen(title) - 1))}╮`;
  console.log(c.dim(top));
  for (const l of lines) console.log(c.dim("│ ") + pad(l, inner) + c.dim(" │"));
  console.log(c.dim(`╰${"─".repeat(inner + 2)}╯`));
}

export function rule(label = ""): void {
  const line = "─".repeat(54);
  console.log(c.dim(label ? `── ${label} ${line.slice(vlen(label) + 4)}` : line));
}

export function kv(key: string, val: string): string {
  return `${c.dim(pad(key, 14))}${val}`;
}

export function step(n: number, total: number, text: string): void {
  console.log(`${c.cyan(`[${n}/${total}]`)} ${text}`);
}

export const ok = (m: string) => console.log(`${c.green("✓")} ${m}`);
export const warn = (m: string) => console.log(`${c.yellow("!")} ${m}`);
export const err = (m: string) => console.log(`${c.red("✗")} ${m}`);
export const info = (m: string) => console.log(`${c.dim("·")} ${m}`);

export function flow(): void {
  const L = [
    "",
    `   ${c.bold("owner")}                                          ${c.bold("reader")}`,
    `     │  seal set ─▶ ${c.cyan("[ Walrus blob ]")} ◀─ decrypt   │`,
    `     │                    ▲                       │`,
    `     └─ grant(addr) ─▶ ${c.magenta("[ on-chain Allowlist ]")} ◀─┘`,
    `                          │`,
    `              ${c.dim("Seal key servers run seal_approve(id, allowlist)")}`,
    `              ${c.dim("→ key released only if reader ∈ allowlist")}`,
    "",
  ];
  for (const l of L) console.log(l);
}

export const shortId = (s: string) => (s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s);
