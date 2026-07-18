import type { ScreenApp } from "../../terminal/screen.js";

interface Point {
  x: number;
  y: number;
}

const COLS = 24;
const ROWS = 16;
const TICK_MS = 130;

/**
 * Classic snake, as a full-screen app. Steer with the arrow keys or WASD on a
 * keyboard, or the on-screen D-pad on a phone. Walls and your own tail are
 * fatal. Food placement uses an injectable rng so the logic is testable.
 */
export class Snake implements ScreenApp {
  private snake: Point[] = [];
  private dir: Point = { x: 1, y: 0 };
  private pending: Point = { x: 1, y: 0 };
  private food: Point = { x: 0, y: 0 };
  private score = 0;
  private dead = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  private titleEl: HTMLDivElement | undefined;
  private boardEl: HTMLPreElement | undefined;
  private statusEl: HTMLDivElement | undefined;

  constructor(
    private readonly exit: () => void,
    private readonly rng: () => number = Math.random,
  ) {
    this.reset();
  }

  // ---- lifecycle -----------------------------------------------------------

  mount(container: HTMLElement): void {
    this.titleEl = document.createElement("div");
    this.titleEl.className = "sk-title";
    this.boardEl = document.createElement("pre");
    this.boardEl.className = "sk-board";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "sk-status";

    const wrap = document.createElement("div");
    wrap.className = "sk";
    wrap.append(this.titleEl, this.boardEl, this.statusEl, this.buildPad());
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

  // ---- input ---------------------------------------------------------------

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
      return;
    }
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        this.steer(0, -1);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.steer(0, 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.steer(-1, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.steer(1, 0);
        break;
      case "Enter":
        e.preventDefault();
        if (this.dead) this.restart();
        break;
      default:
    }
  }

  onText(text: string): void {
    for (const ch of text.toLowerCase()) {
      if (ch === "w") this.steer(0, -1);
      else if (ch === "s") this.steer(0, 1);
      else if (ch === "a") this.steer(-1, 0);
      else if (ch === "d") this.steer(1, 0);
      else if (ch === "q") this.exit();
      else if (ch === "r" && this.dead) this.restart();
    }
  }

  /** Queue a direction, ignoring a 180° reversal into your own neck. */
  private steer(x: number, y: number): void {
    if (x === -this.dir.x && y === -this.dir.y) return;
    this.pending = { x, y };
  }

  // ---- game logic ----------------------------------------------------------

  private reset(): void {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    this.snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    this.dir = { x: 1, y: 0 };
    this.pending = { x: 1, y: 0 };
    this.score = 0;
    this.dead = false;
    this.placeFood();
  }

  private restart(): void {
    this.reset();
    this.start();
    this.render();
  }

  /** Advance one step. Public so tests can drive the loop deterministically. */
  tick(): void {
    if (this.dead) return;
    this.dir = this.pending;
    const head = this.snake[0];
    const next: Point = { x: head.x + this.dir.x, y: head.y + this.dir.y };

    const hitWall =
      next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS;
    // The tail cell vacates this step, so a collision with it is allowed.
    const hitSelf = this.snake
      .slice(0, -1)
      .some((p) => p.x === next.x && p.y === next.y);
    if (hitWall || hitSelf) {
      this.die();
      return;
    }

    this.snake.unshift(next);
    if (next.x === this.food.x && next.y === this.food.y) {
      this.score++;
      this.placeFood();
    } else {
      this.snake.pop();
    }
    this.render();
  }

  private die(): void {
    this.dead = true;
    this.stop();
    this.render();
  }

  private placeFood(): void {
    const occupied = new Set(this.snake.map((p) => `${p.x},${p.y}`));
    const free: Point[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return; // board full — you win by attrition
    this.food = free[Math.floor(this.rng() * free.length)];
  }

  /** Place food at a specific cell — for tests and, later, levels. */
  setFood(x: number, y: number): void {
    this.food = { x, y };
    this.render();
  }

  /** A read-only view of the game state, for tests. */
  snapshot(): { length: number; score: number; dead: boolean; head: Point } {
    return {
      length: this.snake.length,
      score: this.score,
      dead: this.dead,
      head: { ...this.snake[0] },
    };
  }

  // ---- rendering -----------------------------------------------------------

  private buildPad(): HTMLDivElement {
    const pad = document.createElement("div");
    pad.className = "sk-pad";
    pad.append(
      this.padKey("⟳", () => this.restart()),
      this.padKey("↑", () => this.steer(0, -1)),
      this.padKey("✕", () => this.exit()),
      this.padKey("←", () => this.steer(-1, 0)),
      this.padKey("↓", () => this.steer(0, 1)),
      this.padKey("→", () => this.steer(1, 0)),
    );
    return pad;
  }

  private padKey(label: string, onActivate: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sk-key";
    btn.textContent = label;
    btn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      onActivate();
    });
    return btn;
  }

  private render(): void {
    if (!this.boardEl || !this.titleEl || !this.statusEl) return;

    const cells: string[][] = Array.from({ length: ROWS }, () =>
      Array<string>(COLS).fill(" "),
    );
    for (const p of this.snake) cells[p.y][p.x] = "█";
    cells[this.food.y][this.food.x] = "●";

    const top = `┌${"─".repeat(COLS)}┐`;
    const bottom = `└${"─".repeat(COLS)}┘`;
    const mid = cells.map((row) => `│${row.join("")}│`).join("\n");
    this.boardEl.textContent = `${top}\n${mid}\n${bottom}`;

    this.titleEl.textContent = this.dead ? "snake · game over" : "snake";
    this.statusEl.textContent = this.dead
      ? `score ${this.score} · Enter or ⟳ to restart · ^X exit`
      : `score ${this.score} · arrows / WASD / tap · ^X exit`;
  }
}
