/**
 * Minesweeper game logic — pure and DOM-free, so it's easy to unit-test; the
 * {@link ../index} screen app renders it. Mines are laid on the *first* reveal
 * (never under that cell or its neighbours, the classic "first click is safe"
 * rule) using an injectable rng, so a seeded game is deterministic in tests.
 */

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number; // number of neighbouring mines
}

export type GameState = "playing" | "won" | "lost";

export class Minesweeper {
  readonly cells: Cell[][];
  state: GameState = "playing";
  private placed = false;
  /** How many mines are actually on the board — equals `mines` unless the safe
   * area left too few cells (only possible on a pathologically dense config). */
  private effectiveMines: number;

  constructor(
    readonly rows = 9,
    readonly cols = 9,
    readonly mines = 10,
    private readonly rng: () => number = Math.random,
  ) {
    this.effectiveMines = mines;
    this.cells = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 })),
    );
  }

  private inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  /** The (up to eight) in-bounds neighbours of a cell. */
  private neighbours(r: number, c: number): [number, number][] {
    const out: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (this.inBounds(r + dr, c + dc)) out.push([r + dr, c + dc]);
      }
    }
    return out;
  }

  /** Scatter mines after the first reveal, avoiding that cell and its neighbours. */
  private place(safeR: number, safeC: number): void {
    const safe = new Set<number>([safeR * this.cols + safeC]);
    for (const [nr, nc] of this.neighbours(safeR, safeC)) safe.add(nr * this.cols + nc);

    const candidates: number[] = [];
    for (let i = 0; i < this.rows * this.cols; i++) if (!safe.has(i)) candidates.push(i);
    // Fisher–Yates shuffle with the injected rng, then take the first `mines`.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const count = Math.min(this.mines, candidates.length);
    this.effectiveMines = count; // report what actually fit, not what was asked
    for (let k = 0; k < count; k++) {
      const idx = candidates[k];
      this.cells[Math.floor(idx / this.cols)][idx % this.cols].mine = true;
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c].mine) continue;
        this.cells[r][c].adjacent = this.neighbours(r, c).filter(([nr, nc]) => this.cells[nr][nc].mine).length;
      }
    }
    this.placed = true;
  }

  /** Reveal a cell: flood-fills empty regions, ends the game on a mine or a win. */
  reveal(r: number, c: number): void {
    if (this.state !== "playing") return;
    const start = this.cells[r][c];
    if (start.revealed || start.flagged) return;
    if (!this.placed) this.place(r, c);

    const stack: [number, number][] = [[r, c]];
    while (stack.length > 0) {
      const [cr, cc] = stack.pop()!;
      const cell = this.cells[cr][cc];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      if (cell.mine) {
        this.state = "lost";
        this.revealAllMines();
        return;
      }
      // A zero-adjacent cell opens its neighbours (none of which can be mines).
      if (cell.adjacent === 0) {
        for (const [nr, nc] of this.neighbours(cr, cc)) {
          if (!this.cells[nr][nc].revealed) stack.push([nr, nc]);
        }
      }
    }
    this.checkWin();
  }

  /** Toggle a flag on an unrevealed cell. */
  toggleFlag(r: number, c: number): void {
    if (this.state !== "playing") return;
    const cell = this.cells[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
  }

  /** Mines still unflagged (can go negative if over-flagged), for the counter. */
  get minesLeft(): number {
    let flags = 0;
    for (const row of this.cells) for (const cell of row) if (cell.flagged) flags++;
    return this.effectiveMines - flags;
  }

  private revealAllMines(): void {
    for (const row of this.cells) for (const cell of row) if (cell.mine) cell.revealed = true;
  }

  private checkWin(): void {
    for (const row of this.cells) {
      for (const cell of row) if (!cell.mine && !cell.revealed) return;
    }
    this.state = "won";
    for (const row of this.cells) for (const cell of row) if (cell.mine) cell.flagged = true;
  }
}
