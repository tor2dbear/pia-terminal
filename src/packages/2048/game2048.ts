import type { ScreenApp, KeySpec } from "../../terminal/screen.js";

export type Dir = "left" | "right" | "up" | "down";
const SIZE = 4;

/** Arrow keys and WASD → a direction. */
const KEY_DIRS: Record<string, Dir> = {
  arrowleft: "left", a: "left",
  arrowright: "right", d: "right",
  arrowup: "up", w: "up",
  arrowdown: "down", s: "down",
};

/** Slide+merge one row to the left; returns the new row and points gained. */
function slideLeft(row: number[]): { row: number[]; gained: number } {
  const nums = row.filter((n) => n !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const merged = nums[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, gained };
}

const equalGrid = (a: number[][], b: number[][]): boolean =>
  a.every((row, r) => row.every((v, c) => v === b[r][c]));

/**
 * 2048 as a full-screen app: slide tiles with the arrow keys / WASD (or the
 * on-screen D-pad), equal tiles merge, a new 2 (or 4) appears after each move.
 * Reach 2048 to win. The grid logic is pure and rng is injectable, so it's
 * testable without the DOM.
 */
export class Game2048 implements ScreenApp {
  private grid: number[][];
  private score = 0;
  private won = false;
  private over = false;

  private titleEl: HTMLDivElement | undefined;
  private boardEl: HTMLDivElement | undefined;
  private statusEl: HTMLDivElement | undefined;

  constructor(
    private readonly exit: () => void,
    private readonly rng: () => number = Math.random,
  ) {
    this.grid = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
    this.spawn();
    this.spawn();
  }

  // ---- pure game state (testable) ------------------------------------------

  snapshot(): { grid: number[][]; score: number; won: boolean; over: boolean } {
    return {
      grid: this.grid.map((row) => [...row]),
      score: this.score,
      won: this.won,
      over: this.over,
    };
  }

  /** Set the board directly — for tests. */
  setGrid(grid: number[][]): void {
    this.grid = grid.map((row) => [...row]);
  }

  private emptyCells(): [number, number][] {
    const cells: [number, number][] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (this.grid[r][c] === 0) cells.push([r, c]);
    return cells;
  }

  private spawn(): void {
    const cells = this.emptyCells();
    if (cells.length === 0) return;
    const [r, c] = cells[Math.floor(this.rng() * cells.length)];
    this.grid[r][c] = this.rng() < 0.9 ? 2 : 4;
  }

  /** Transform the grid so a move in `dir` becomes a left-slide, and back. */
  private rowsFor(dir: Dir): number[][] {
    if (dir === "left") return this.grid.map((row) => [...row]);
    if (dir === "right") return this.grid.map((row) => [...row].reverse());
    const cols: number[][] = Array.from({ length: SIZE }, (_, c) =>
      this.grid.map((row) => row[c]),
    );
    return dir === "up" ? cols : cols.map((col) => [...col].reverse());
  }

  private applyRows(dir: Dir, rows: number[][]): void {
    const next = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        const v = rows[i][j];
        if (dir === "left") next[i][j] = v;
        else if (dir === "right") next[i][SIZE - 1 - j] = v;
        else if (dir === "up") next[j][i] = v;
        else next[SIZE - 1 - j][i] = v;
      }
    }
    this.grid = next;
  }

  /** Slide+merge in a direction. Returns whether anything moved. */
  move(dir: Dir): boolean {
    if (this.over) return false;
    const before = this.grid.map((row) => [...row]);
    const rows = this.rowsFor(dir).map(slideLeft);
    this.applyRows(dir, rows.map((r) => r.row));
    if (equalGrid(before, this.grid)) return false; // nothing moved → no spawn
    this.score += rows.reduce((sum, r) => sum + r.gained, 0);
    if (this.grid.some((row) => row.includes(2048))) this.won = true;
    this.spawn();
    if (!this.canMove()) this.over = true;
    return true;
  }

  private canMove(): boolean {
    if (this.emptyCells().length > 0) return true;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const v = this.grid[r][c];
        if ((c + 1 < SIZE && this.grid[r][c + 1] === v) || (r + 1 < SIZE && this.grid[r + 1][c] === v)) {
          return true;
        }
      }
    return false;
  }

  // ---- screen app ----------------------------------------------------------

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "g2048";
    this.titleEl = document.createElement("div");
    this.titleEl.className = "g2048-title";
    this.boardEl = document.createElement("div");
    this.boardEl.className = "g2048-board";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "g2048-status";
    wrap.append(this.titleEl, this.boardEl, this.statusEl, this.buildPad());
    container.append(wrap);
    this.render();
  }

  unmount(): void {
    /* nothing to clean up */
  }

  onText(): void {
    /* movement is on the keys/D-pad */
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
      return;
    }
    const dir = KEY_DIRS[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      if (this.move(dir)) this.render();
    }
  }

  keys(): KeySpec[] {
    const step = (dir: Dir): void => {
      if (this.move(dir)) this.render();
    };
    return [
      { label: "←", run: () => step("left") },
      { label: "↓", run: () => step("down") },
      { label: "↑", run: () => step("up") },
      { label: "→", run: () => step("right") },
      { label: "^X", run: () => this.exit() },
    ];
  }

  private buildPad(): HTMLElement {
    const pad = document.createElement("div");
    pad.className = "g2048-pad";
    // Rendered but hidden on desktop via CSS; the shared key bar covers mobile.
    return pad;
  }

  private render(): void {
    if (!this.boardEl || !this.titleEl || !this.statusEl) return;
    this.titleEl.textContent = `2048    score ${this.score}`;
    this.boardEl.replaceChildren();
    for (const row of this.grid) {
      for (const v of row) {
        const cell = document.createElement("div");
        cell.className = v ? `g2048-cell g2048-${v}` : "g2048-cell g2048-empty";
        cell.textContent = v ? String(v) : "";
        this.boardEl.append(cell);
      }
    }
    this.statusEl.textContent = this.over
      ? "game over — ^X to exit"
      : this.won
        ? "you made 2048! keep going, or ^X to exit"
        : "arrows / WASD to slide · ^X to exit";
  }
}
