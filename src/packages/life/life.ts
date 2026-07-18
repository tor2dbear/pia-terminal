import type { KeySpec, ScreenApp } from "../../terminal/screen.js";

/**
 * Conway's Game of Life. A bounded grid (edges are permanently dead) evolving by
 * the classic B3/S23 rules. The board and its `step()` are pure and testable;
 * the screen app just seeds it and steps on a timer.
 */
export class Life {
  private grid: boolean[][];

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.grid = Life.blank(width, height);
  }

  private static blank(w: number, h: number): boolean[][] {
    return Array.from({ length: h }, () => Array<boolean>(w).fill(false));
  }

  get(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[y][x];
  }

  set(x: number, y: number, alive: boolean): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.grid[y][x] = alive;
  }

  /** Seed the grid randomly. `density` is the chance a cell starts alive. */
  randomize(rng: () => number, density = 0.3): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) this.grid[y][x] = rng() < density;
    }
  }

  private neighbors(x: number, y: number): number {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.get(x + dx, y + dy)) n++;
      }
    }
    return n;
  }

  /** Advance one generation (B3/S23). */
  step(): void {
    const next = Life.blank(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const n = this.neighbors(x, y);
        next[y][x] = this.grid[y][x] ? n === 2 || n === 3 : n === 3;
      }
    }
    this.grid = next;
  }

  population(): number {
    let count = 0;
    for (const row of this.grid) for (const cell of row) if (cell) count++;
    return count;
  }

  render(): string[] {
    return this.grid.map((row) =>
      row.map((c) => (c ? "█" : " ")).join("").replace(/\s+$/, ""),
    );
  }
}

const COLS = 48;
const ROWS = 24;
const TICK_MS = 120;

export class LifeApp implements ScreenApp {
  private life = new Life(COLS, ROWS);
  private timer: ReturnType<typeof setInterval> | undefined;
  private paused = false;
  private gen = 0;
  private boardEl: HTMLPreElement | undefined;
  private statusEl: HTMLDivElement | undefined;

  constructor(private readonly exit: () => void) {
    this.life.randomize(Math.random);
  }

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "life";
    this.boardEl = document.createElement("pre");
    this.boardEl.className = "life-board";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "life-status";
    wrap.append(this.boardEl, this.statusEl);
    container.append(wrap);
    this.render();
    this.start();
  }

  unmount(): void {
    this.stop();
  }

  private start(): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
    } else if (e.key === " ") {
      e.preventDefault();
      this.togglePause();
    }
  }

  onText(text: string): void {
    for (const ch of text.toLowerCase()) {
      if (ch === "q") this.exit();
      else if (ch === "p" || ch === " ") this.togglePause();
      else if (ch === "s") this.stepOnce();
      else if (ch === "r") this.reseed();
    }
  }

  keys(): KeySpec[] {
    return [
      { label: "⏯", run: () => this.togglePause() },
      { label: "step", run: () => this.stepOnce() },
      { label: "reseed", run: () => this.reseed() },
      { label: "quit", run: () => this.exit() },
    ];
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) this.stop();
    else this.start();
    this.render();
  }

  private stepOnce(): void {
    this.paused = true;
    this.stop();
    this.advance();
  }

  private reseed(): void {
    this.life.randomize(Math.random);
    this.gen = 0;
    this.render();
  }

  private tick(): void {
    if (!this.paused) this.advance();
  }

  private advance(): void {
    this.life.step();
    this.gen++;
    this.render();
  }

  private render(): void {
    if (this.boardEl) this.boardEl.textContent = this.life.render().join("\n");
    if (this.statusEl) {
      this.statusEl.textContent = `gen ${this.gen} · pop ${this.life.population()} · ${
        this.paused ? "paused" : "running"
      } · space pause · s step · r reseed · ^X exit`;
    }
  }
}
