import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { KeySpec, ScreenApp } from "../../terminal/screen.js";
import type { Package } from "../types.js";
import { encodeQr, type Ecl } from "./qrcode.js";

export { encodeQr };

/**
 * Render a QR matrix to text lines using half-block characters, so two module
 * rows share one text row (near-square in a monospace cell). A 4-module quiet
 * zone is added all round, as the spec requires for reliable scanning.
 */
export function renderQr(modules: boolean[][], quiet = 4): string[] {
  const n = modules.length;
  const size = n + quiet * 2;
  const dark = (r: number, c: number): boolean => {
    const mr = r - quiet;
    const mc = c - quiet;
    if (mr < 0 || mr >= n || mc < 0 || mc >= n) return false; // quiet zone
    return modules[mr][mc];
  };
  const lines: string[] = [];
  for (let r = 0; r < size; r += 2) {
    let line = "";
    for (let c = 0; c < size; c++) {
      const top = dark(r, c);
      const bot = r + 1 < size ? dark(r + 1, c) : false;
      line += top && bot ? "█" : top ? "▀" : bot ? "▄" : " ";
    }
    lines.push(line);
  }
  return lines;
}

class QrView implements ScreenApp {
  constructor(
    private readonly exit: () => void,
    private readonly text: string,
    private readonly modules: boolean[][],
  ) {}

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "qr";
    const board = document.createElement("pre");
    board.className = "qr-code";
    board.textContent = renderQr(this.modules).join("\n");
    const caption = document.createElement("div");
    caption.className = "qr-caption";
    const shown = this.text.length > 60 ? this.text.slice(0, 57) + "…" : this.text;
    caption.textContent = `${shown}  ·  ${this.modules.length}×${this.modules.length}  ·  ^X exit`;
    wrap.append(board, caption);
    container.append(wrap);
  }

  unmount(): void {
    // Nothing to tear down.
  }

  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey && (e.key === "x" || e.key === "X")) || e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      this.exit();
    }
  }

  onText(text: string): void {
    if (text.toLowerCase().includes("q")) this.exit();
  }

  keys(): KeySpec[] {
    return [{ label: "close", run: () => this.exit() }];
  }
}

/**
 * `qr` — show a QR code for the given text (or a URL). Reads its argument, or
 * piped input if there are no arguments, so `share notes.txt` can flow into it.
 * `-l`/`-m`/`-q`/`-h` pick the error-correction level (default M).
 */
const qr: Command<CoreCommandContext> = {
  name: "qr",
  help: "show a QR code for text or a URL",
  usage: "qr [-l|-m|-q|-h] <text>   (or pipe text in)",
  async run(args, ctx) {
    let ecl: Ecl = "M";
    const rest: string[] = [];
    for (const a of args) {
      if (a === "-l") ecl = "L";
      else if (a === "-m") ecl = "M";
      else if (a === "-q") ecl = "Q";
      else if (a === "-h") ecl = "H";
      else rest.push(a);
    }
    const text = rest.length > 0 ? rest.join(" ") : ctx.stdin.trim();
    if (text === "") {
      ctx.print("usage: qr <text>");
      return;
    }
    let modules: boolean[][];
    try {
      modules = encodeQr(text, ecl);
    } catch (err) {
      ctx.error(`qr: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await ctx.runApp((exit) => new QrView(exit, text, modules));
  },
};

export const pkg: Package = {
  name: "qr",
  description: "show a QR code for text or a share link",
  commands: [qr],
};
