import type { ScreenApp, KeySpec } from "../../terminal/screen.js";

const COLS = 32;
const ROWS = 12;
const FILL = "█";

/**
 * A tiny ASCII sketchpad, full-screen. Move the cursor with the arrows/WASD,
 * toggle a block with space, clear with `c`. On exit (^X) the drawing is printed
 * back into the terminal so you keep it. Pure grid state — easy to test.
 */
export class Draw implements ScreenApp {
  private readonly cells: boolean[][] = Array.from({ length: ROWS }, () =>
    Array<boolean>(COLS).fill(false),
  );
  private cx = 0;
  private cy = 0;

  private boardEl: HTMLPreElement | undefined;
  private statusEl: HTMLDivElement | undefined;

  constructor(
    private readonly exit: () => void,
    private readonly onExit: (art: string) => void,
  ) {}

  // ---- state (testable) ----------------------------------------------------

  move(dx: number, dy: number): void {
    this.cx = Math.max(0, Math.min(COLS - 1, this.cx + dx));
    this.cy = Math.max(0, Math.min(ROWS - 1, this.cy + dy));
  }

  toggle(): void {
    this.cells[this.cy][this.cx] = !this.cells[this.cy][this.cx];
  }

  clear(): void {
    for (const row of this.cells) row.fill(false);
  }

  /** The drawing as text: filled cells as blocks, trailing space/rows trimmed. */
  toText(): string {
    const lines = this.cells.map((row) =>
      row.map((on) => (on ? FILL : " ")).join("").replace(/\s+$/, ""),
    );
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  // ---- screen app ----------------------------------------------------------

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "draw";
    const title = document.createElement("div");
    title.className = "draw-title";
    title.textContent = "  sketchpad";
    this.boardEl = document.createElement("pre");
    this.boardEl.className = "draw-board";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "draw-status";
    this.statusEl.textContent = "move: arrows/WASD · draw: space · clear: c · ^X: done";
    wrap.append(title, this.boardEl, this.statusEl);
    container.append(wrap);
    this.render();
  }

  unmount(): void {
    /* nothing to clean up */
  }

  onText(text: string): void {
    if (text.includes(" ")) {
      this.toggle();
      this.render();
    }
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.finish();
      return;
    }
    const key = e.key.toLowerCase();
    const moves: Record<string, [number, number]> = {
      arrowleft: [-1, 0], a: [-1, 0],
      arrowright: [1, 0], d: [1, 0],
      arrowup: [0, -1], w: [0, -1],
      arrowdown: [0, 1], s: [0, 1],
    };
    if (moves[key]) {
      e.preventDefault();
      this.move(...moves[key]);
      this.render();
    } else if (key === " " || e.key === "Enter") {
      e.preventDefault();
      this.toggle();
      this.render();
    } else if (key === "c") {
      e.preventDefault();
      this.clear();
      this.render();
    }
  }

  keys(): KeySpec[] {
    const act = (fn: () => void): void => {
      fn();
      this.render();
    };
    return [
      { label: "←", run: () => act(() => this.move(-1, 0)) },
      { label: "↓", run: () => act(() => this.move(0, 1)) },
      { label: "↑", run: () => act(() => this.move(0, -1)) },
      { label: "→", run: () => act(() => this.move(1, 0)) },
      { label: "draw", run: () => act(() => this.toggle()) },
      { label: "clear", subtle: true, run: () => act(() => this.clear()) },
      { label: "^X", run: () => this.finish() },
    ];
  }

  private finish(): void {
    const art = this.toText();
    this.onExit(art === "" ? "(empty sketch)" : art);
    this.exit();
  }

  private render(): void {
    if (!this.boardEl) return;
    this.boardEl.replaceChildren();
    this.cells.forEach((row, y) => {
      const line = document.createElement("div");
      line.className = "draw-line";
      row.forEach((on, x) => {
        const cell = document.createElement("span");
        const cursor = x === this.cx && y === this.cy;
        cell.className = cursor ? "draw-cell draw-cursor" : "draw-cell";
        cell.textContent = on ? FILL : "·";
        line.append(cell);
      });
      this.boardEl!.append(line);
    });
  }
}
