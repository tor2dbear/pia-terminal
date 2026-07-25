import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { ScreenApp, KeySpec } from "../../terminal/screen.js";
import type { Package } from "../types.js";
import { Minesweeper } from "./minesweeper.js";

export { Minesweeper };

/**
 * Minesweeper as a full-screen app: a 9×9 beginner board with 10 mines. Move the
 * cursor with the arrows / WASD (or the on-screen D-pad), reveal with Space /
 * Enter, flag with `f`. The first reveal is always safe. `r` starts a new game,
 * `q` / Esc quits. The board model is injectable-rng so tests are deterministic.
 */
class MinesweeperApp implements ScreenApp {
  private game = new Minesweeper();
  private r = 0;
  private c = 0;
  private rootEl?: HTMLElement;

  constructor(private readonly exit: () => void) {}

  mount(container: HTMLElement): void {
    this.rootEl = document.createElement("div");
    this.rootEl.className = "ms";
    container.append(this.rootEl);
    this.render();
  }

  unmount(): void {
    /* nothing to clean up */
  }

  keys(): KeySpec[] {
    return [
      { label: "←", run: () => this.move(0, -1) },
      { label: "↑", run: () => this.move(-1, 0) },
      { label: "↓", run: () => this.move(1, 0) },
      { label: "→", run: () => this.move(0, 1) },
      { label: "◉", startsGroup: true, run: () => this.reveal() },
      { label: "⚑", run: () => this.flag() },
      { label: "q", startsGroup: true, run: () => this.exit() },
    ];
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === "Escape" || (e.ctrlKey && (e.key === "x" || e.key === "X"))) {
      e.preventDefault();
      return this.exit();
    }
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); return this.move(-1, 0);
      case "ArrowDown": e.preventDefault(); return this.move(1, 0);
      case "ArrowLeft": e.preventDefault(); return this.move(0, -1);
      case "ArrowRight": e.preventDefault(); return this.move(0, 1);
      case "Enter": e.preventDefault(); return this.reveal();
    }
  }

  onText(text: string): void {
    for (const ch of text) {
      switch (ch.toLowerCase()) {
        case "q": return this.exit();
        case " ": this.reveal(); break;
        case "f": this.flag(); break;
        case "r": this.restart(); break;
        case "w": this.move(-1, 0); break;
        case "a": this.move(0, -1); break;
        case "s": this.move(1, 0); break;
        case "d": this.move(0, 1); break;
      }
    }
  }

  /** Test view of the model. */
  snapshot(): { state: string; cursor: [number, number]; minesLeft: number } {
    return { state: this.game.state, cursor: [this.r, this.c], minesLeft: this.game.minesLeft };
  }

  // ---- actions --------------------------------------------------------------

  private move(dr: number, dc: number): void {
    this.r = Math.max(0, Math.min(this.game.rows - 1, this.r + dr));
    this.c = Math.max(0, Math.min(this.game.cols - 1, this.c + dc));
    this.render();
  }

  private reveal(): void {
    this.game.reveal(this.r, this.c);
    this.render();
  }

  private flag(): void {
    this.game.toggleFlag(this.r, this.c);
    this.render();
  }

  private restart(): void {
    this.game = new Minesweeper();
    this.r = 0;
    this.c = 0;
    this.render();
  }

  // ---- rendering ------------------------------------------------------------

  private render(): void {
    if (!this.rootEl) return;
    this.rootEl.replaceChildren();

    const title = document.createElement("div");
    title.className = "ms-title";
    title.textContent = "  MINESWEEPER";
    this.rootEl.append(title);

    const status = document.createElement("div");
    status.className = "ms-status";
    status.textContent =
      this.game.state === "won"
        ? "cleared! 🎉  r for a new game, q to exit"
        : this.game.state === "lost"
          ? "boom 💥  r for a new game, q to exit"
          : `mines left: ${this.game.minesLeft}  ·  ◉ reveal · ⚑ flag`;
    this.rootEl.append(status);

    this.rootEl.append(this.buildGrid());
  }

  private buildGrid(): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "ms-grid";
    const over = this.game.state !== "playing";
    for (let r = 0; r < this.game.rows; r++) {
      const row = document.createElement("div");
      row.className = "ms-row";
      for (let c = 0; c < this.game.cols; c++) {
        row.append(this.buildCell(r, c, over));
      }
      grid.append(row);
    }
    return grid;
  }

  private buildCell(r: number, c: number, over: boolean): HTMLElement {
    const cell = this.game.cells[r][c];
    const el = document.createElement("button");
    el.type = "button";
    el.className = "ms-cell";
    if (r === this.r && c === this.c && !over) el.classList.add("cursor");

    if (cell.flagged) {
      el.classList.add("flag");
      el.textContent = "⚑";
    } else if (cell.revealed) {
      if (cell.mine) {
        el.classList.add("mine");
        el.textContent = "✳";
      } else {
        el.classList.add("open");
        if (cell.adjacent > 0) {
          el.classList.add(`n${cell.adjacent}`);
          el.textContent = String(cell.adjacent);
        }
      }
    }

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.r = r;
      this.c = c;
      this.reveal();
    });
    return el;
  }
}

const minesweeper: Command<CoreCommandContext> = {
  name: "minesweeper",
  help: "clear the 9×9 board without hitting a mine",
  aliases: ["mines"],
  async run(_args, ctx) {
    await ctx.runApp((exit) => new MinesweeperApp(exit));
  },
};

export const pkg: Package = {
  name: "minesweeper",
  description: "clear the minefield — arrows/WASD move, reveal, flag",
  commands: [minesweeper],
};
