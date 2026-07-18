import type { ScreenApp } from "../../terminal/screen.js";

/**
 * `cmatrix` — the falling-glyph "digital rain". Each column runs a drop whose
 * head descends one row per tick, leaving a finite trail behind it; when a drop
 * clears the bottom the column re-spawns. The simulation is a pure, tickable
 * object with an injectable rng, so it's deterministic under test; the screen
 * app just renders its grid on a timer.
 */

const CHARS =
  "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜｵﾘﾎﾅ0123456789Zﾂｸ:.=*+-<>|ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface Column {
  active: boolean;
  head: number; // row of the leading glyph (can start negative)
  len: number; // trail length
}

export class MatrixRain {
  private cols: Column[];
  private glyph: string[][];

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly rng: () => number = Math.random,
  ) {
    this.cols = Array.from({ length: width }, () => ({
      active: false,
      head: 0,
      len: 0,
    }));
    this.glyph = Array.from({ length: height }, () =>
      Array<string>(width).fill(" "),
    );
  }

  private randChar(): string {
    return CHARS[Math.floor(this.rng() * CHARS.length)] ?? "0";
  }

  private spawn(col: Column): void {
    col.active = true;
    col.head = 0;
    col.len = 4 + Math.floor(this.rng() * (this.height - 2));
  }

  /** Advance the rain one step. Public so tests can drive it deterministically. */
  tick(): void {
    for (let x = 0; x < this.width; x++) {
      const col = this.cols[x];
      if (col.active) {
        if (col.head >= 0 && col.head < this.height) {
          this.glyph[col.head][x] = this.randChar();
        }
        // Erase the cell that just fell off the tail.
        const tail = col.head - col.len;
        if (tail >= 0 && tail < this.height) this.glyph[tail][x] = " ";
        col.head++;
        if (col.head - col.len >= this.height) col.active = false;
      } else if (this.rng() < 0.03) {
        this.spawn(col);
      }
    }
  }

  /** The grid as an array of text rows. */
  render(): string[] {
    return this.glyph.map((row) => row.join("").replace(/\s+$/, ""));
  }

  /** State view for tests. */
  snapshot(): { active: number; heads: number[] } {
    return {
      active: this.cols.filter((c) => c.active).length,
      heads: this.cols.map((c) => c.head),
    };
  }
}

const COLS = 60;
const ROWS = 24;
const TICK_MS = 80;

export class CmMatrix implements ScreenApp {
  private rain: MatrixRain;
  private timer: ReturnType<typeof setInterval> | undefined;
  private boardEl: HTMLPreElement | undefined;

  constructor(private readonly exit: () => void) {
    this.rain = new MatrixRain(COLS, ROWS);
  }

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "cm";
    this.boardEl = document.createElement("pre");
    this.boardEl.className = "cm-board";
    wrap.append(this.boardEl);
    container.append(wrap);
    // Warm up so the screen isn't empty on the first frame.
    for (let i = 0; i < ROWS; i++) this.rain.tick();
    this.render();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  unmount(): void {
    this.stop();
  }

  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  onKey(e: KeyboardEvent): void {
    // Any of ^X, Escape, or q quits.
    if ((e.ctrlKey && (e.key === "x" || e.key === "X")) || e.key === "Escape") {
      e.preventDefault();
      this.exit();
    }
  }

  onText(text: string): void {
    if (text.toLowerCase().includes("q")) this.exit();
  }

  keys() {
    return [{ label: "quit", run: () => this.exit() }];
  }

  private tick(): void {
    this.rain.tick();
    this.render();
  }

  private render(): void {
    if (this.boardEl) this.boardEl.textContent = this.rain.render().join("\n");
  }
}
