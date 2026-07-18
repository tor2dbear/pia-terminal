/**
 * Tetris game logic — pure and headless, so the whole thing is unit-testable.
 * A 10×20 well, the seven tetrominoes from a shuffled 7-bag (injectable rng),
 * rotation with a simple wall-kick, gravity, line clears and scoring. The screen
 * app in `TetrisApp` renders a snapshot; it holds no rules of its own.
 */

export const WIDTH = 10;
export const HEIGHT = 20;

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

interface Shape {
  size: number;
  cells: [number, number][];
}

// Each piece in its spawn orientation, within a size×size box. Colour ids match
// the order below (1-based), so 0 stays "empty".
const SHAPES: Record<PieceType, Shape> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

const TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];
const COLOR: Record<PieceType, number> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
};

interface Piece {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
}

/** Line-clear scores by count (Tetris = 4), scaled by level in the game. */
const LINE_SCORE = [0, 100, 300, 500, 800];

export interface Snapshot {
  /** The locked board with the active piece overlaid, colour ids (0 = empty). */
  cells: number[][];
  score: number;
  lines: number;
  level: number;
  over: boolean;
  next: PieceType;
}

export class Tetris {
  private board: number[][];
  private bag: PieceType[] = [];
  private current: Piece;
  private nextType: PieceType;
  score = 0;
  lines = 0;
  over = false;

  constructor(private readonly rng: () => number = Math.random) {
    this.board = Array.from({ length: HEIGHT }, () => Array<number>(WIDTH).fill(0));
    this.nextType = this.drawFromBag();
    this.current = this.spawn();
  }

  get level(): number {
    return Math.floor(this.lines / 10) + 1;
  }

  // ---- pieces --------------------------------------------------------------

  private refillBag(): void {
    const bag = [...TYPES];
    // Fisher–Yates with the injected rng.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.bag = bag;
  }

  private drawFromBag(): PieceType {
    if (this.bag.length === 0) this.refillBag();
    return this.bag.pop() as PieceType;
  }

  private spawn(): Piece {
    const type = this.nextType;
    this.nextType = this.drawFromBag();
    const size = SHAPES[type].size;
    const piece: Piece = { type, rot: 0, x: Math.floor((WIDTH - size) / 2), y: 0 };
    if (this.collides(piece)) this.over = true;
    return piece;
  }

  /** Absolute board cells occupied by a piece in its current position. */
  private cellsOf(piece: Piece): [number, number][] {
    const { size, cells } = SHAPES[piece.type];
    return cells.map(([cx, cy]) => {
      let x = cx;
      let y = cy;
      // Rotate CW `rot` times inside the size×size box.
      for (let r = 0; r < piece.rot; r++) {
        const nx = size - 1 - y;
        const ny = x;
        x = nx;
        y = ny;
      }
      return [x + piece.x, y + piece.y];
    });
  }

  private collides(piece: Piece): boolean {
    return this.cellsOf(piece).some(
      ([x, y]) =>
        x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && this.board[y][x] !== 0),
    );
  }

  // ---- moves ---------------------------------------------------------------

  private tryUpdate(next: Piece): boolean {
    if (this.over || this.collides(next)) return false;
    this.current = next;
    return true;
  }

  move(dx: number, dy: number): boolean {
    return this.tryUpdate({ ...this.current, x: this.current.x + dx, y: this.current.y + dy });
  }

  rotate(): boolean {
    if (this.over) return false;
    const rot = (this.current.rot + 1) % 4;
    // Try the rotation, then nudge left/right (basic wall kick).
    for (const kick of [0, -1, 1, -2, 2]) {
      const candidate = { ...this.current, rot, x: this.current.x + kick };
      if (!this.collides(candidate)) {
        this.current = candidate;
        return true;
      }
    }
    return false;
  }

  /** Gravity / soft drop: down one, or lock if it can't fall. */
  softDrop(): void {
    if (this.over) return;
    if (!this.move(0, 1)) this.lock();
  }

  hardDrop(): void {
    if (this.over) return;
    while (this.move(0, 1)) this.score += 2;
    this.lock();
  }

  private lock(): void {
    for (const [x, y] of this.cellsOf(this.current)) {
      if (y >= 0) this.board[y][x] = COLOR[this.current.type];
    }
    this.clearLines();
    this.current = this.spawn();
  }

  private clearLines(): void {
    const kept = this.board.filter((row) => row.some((c) => c === 0));
    const cleared = HEIGHT - kept.length;
    if (cleared > 0) {
      const empty = Array.from({ length: cleared }, () => Array<number>(WIDTH).fill(0));
      this.board = [...empty, ...kept];
      this.lines += cleared;
      this.score += LINE_SCORE[cleared] * this.level;
    }
  }

  // ---- view ----------------------------------------------------------------

  snapshot(): Snapshot {
    const cells = this.board.map((row) => [...row]);
    if (!this.over) {
      for (const [x, y] of this.cellsOf(this.current)) {
        if (y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) cells[y][x] = COLOR[this.current.type];
      }
    }
    return {
      cells,
      score: this.score,
      lines: this.lines,
      level: this.level,
      over: this.over,
      next: this.nextType,
    };
  }

  // ---- test hooks ----------------------------------------------------------

  /** Replace the locked board (for tests). */
  setBoard(rows: number[][]): void {
    this.board = rows.map((row) => [...row]);
  }

  /** Force the active piece to a type/position (for tests). */
  setCurrent(type: PieceType, x: number, y: number, rot = 0): void {
    this.current = { type, x, y, rot };
  }

  /** Drop and lock the current piece straight down (for tests). */
  dropAndLock(): void {
    this.hardDrop();
  }
}
