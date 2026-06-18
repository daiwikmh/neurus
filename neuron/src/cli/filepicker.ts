import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { c } from "./ui";

interface Entry { name: string; dir: boolean }

// A live, filter-as-you-type file picker rendered above the prompt. Triggered by "@".
// Type to filter · ↑↓ to move · ⏎ to open a folder or choose a file · esc to cancel.
// Relies on keypress events already enabled by the readline interface.
export function pickPath(startDir: string): Promise<string | null> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return Promise.resolve(null);

  return new Promise<string | null>((resolveP) => {
    let dir = startDir;
    let filter = "";
    let sel = 0;
    let top = 0;
    let entries: Entry[] = [];
    let lastLines = 0;

    const visible = () => entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));

    const load = async () => {
      try {
        const es = await readdir(dir, { withFileTypes: true });
        entries = es
          .filter((e) => !e.name.startsWith("."))
          .map((e) => ({ name: e.name, dir: e.isDirectory() }))
          .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
      } catch {
        entries = [];
      }
      sel = 0;
      top = 0;
    };

    const MAX = 8;
    const render = () => {
      const items = visible();
      if (sel >= items.length) sel = Math.max(0, items.length - 1);
      // Scroll the window so the selected row is always visible.
      if (sel < top) top = sel;
      else if (sel >= top + MAX) top = sel - MAX + 1;
      top = Math.min(top, Math.max(0, items.length - MAX));
      if (lastLines) process.stdout.write(`\x1b[${lastLines}A\x1b[0J`);
      const head = `${c.cyan("@")} ${c.dim(dir)}`;
      const rows = items.slice(top, top + MAX).map((e, i) => {
        const abs = top + i;
        const marker = abs === sel ? c.cyan("›") : " ";
        const name = e.dir ? e.name + "/" : e.name;
        return `  ${marker} ${abs === sel ? c.bold(name) : c.gray(name)}`;
      });
      if (!rows.length) rows.push(c.dim("    (no matches)"));
      const pos = items.length ? `  ${sel + 1}/${items.length}${items.length > MAX ? "  ↑↓ scroll" : ""}` : "";
      const foot = c.dim(`  ↑↓ select · ⏎ open · esc cancel · @${filter}${pos}`);
      const out = [head, ...rows, foot];
      process.stdout.write(out.join("\n") + "\n");
      lastLines = out.length;
    };

    const cleanup = (result: string | null) => {
      stdin.removeListener("keypress", onKey);
      if (lastLines) process.stdout.write(`\x1b[${lastLines}A\x1b[0J`);
      resolveP(result);
    };

    const onKey = (_str: string, key: { name?: string; sequence?: string }) => {
      const name = key?.name;
      if (name === "escape") return cleanup(null);
      if (name === "return" || name === "enter") {
        const e = visible()[sel];
        if (!e) return cleanup(null);
        const full = join(dir, e.name);
        if (e.dir) { dir = full; filter = ""; void load().then(render); return; }
        return cleanup(full);
      }
      if (name === "up") { sel = Math.max(0, sel - 1); render(); return; }
      if (name === "down") { sel = Math.min(visible().length - 1, sel + 1); render(); return; }
      if (name === "backspace") {
        if (filter) { filter = filter.slice(0, -1); sel = 0; render(); return; }
        const parent = dirname(dir);
        if (parent !== dir) { dir = parent; filter = ""; void load().then(render); }
        return;
      }
      const ch = key?.sequence;
      if (ch && ch.length === 1 && ch >= " ") { filter += ch; sel = 0; render(); }
    };

    void load().then(() => { stdin.on("keypress", onKey); render(); });
  });
}
