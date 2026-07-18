import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { KeySpec, ScreenApp } from "../../terminal/screen.js";
import type { Package } from "../types.js";
import { Tetris } from "./tetris.js";

export { Tetris };

const BLOCKS = ["  ", "██"];

class TetrisApp implements ScreenApp {
  private game = new Tetris();
  private timer: ReturnType<typeof setInterval> | undefined;
  private level = 1;

  private boardEl: HTMLPreElement | undefined;
  private statusEl: HTMLDivElement | undefined;

  constructor(private readonly exit: () => void) {}

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "tetris";
    this.boardEl = document.createElement("pre");
    this.boardEl.className = "tetris-board";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "tetris-status";
    wrap.append(this.boardEl, this.statusEl, this.buildPad());
    container.append(wrap);
    this.render();
    this.start();
  }

  unmount(): void {
    this.stop();
  }

  private intervalMs(): number {
    return Math.max(100, 800 - (this.game.level - 1) * 70);
  }

  private start(): void {
    this.stop();
    this.level = this.game.level;
    this.timer = setInterval(() => this.gravity(), this.intervalMs());
  }

  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private gravity(): void {
    this.game.softDrop();
    if (this.game.over) this.stop();
    else if (this.game.level !== this.level) this.start(); // re-arm faster
    this.render();
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
      return;
    }
    if (this.game.over) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.restart();
      }
      return;
    }
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        this.game.move(-1, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        this.game.move(1, 0);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.game.softDrop();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.game.rotate();
        break;
      case " ":
        e.preventDefault();
        this.game.hardDrop();
        break;
      default:
        return;
    }
    if (this.game.over) this.stop();
    this.render();
  }

  onText(text: string): void {
    for (const ch of text.toLowerCase()) {
      if (ch === "q") this.exit();
      else if (this.game.over && ch === "r") this.restart();
    }
  }

  keys(): KeySpec[] {
    return [
      { label: "←", run: () => this.act(() => this.game.move(-1, 0)) },
      { label: "⟳", run: () => this.act(() => this.game.rotate()) },
      { label: "→", run: () => this.act(() => this.game.move(1, 0)) },
      { label: "↓", run: () => this.act(() => this.game.softDrop()) },
      { label: "drop", run: () => this.act(() => this.game.hardDrop()) },
      { label: "quit", run: () => this.exit() },
    ];
  }

  private act(fn: () => void): void {
    if (this.game.over) return;
    fn();
    if (this.game.over) this.stop();
    this.render();
  }

  private restart(): void {
    this.game = new Tetris();
    this.start();
    this.render();
  }

  private buildPad(): HTMLDivElement {
    const pad = document.createElement("div");
    pad.className = "tetris-pad";
    for (const key of this.keys()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tetris-key";
      btn.textContent = key.label;
      btn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        key.run();
      });
      pad.append(btn);
    }
    return pad;
  }

  private render(): void {
    if (!this.boardEl || !this.statusEl) return;
    const snap = this.game.snapshot();
    const width = snap.cells[0].length;
    const top = `┌${"──".repeat(width)}┐`;
    const bottom = `└${"──".repeat(width)}┘`;
    const rows = snap.cells.map(
      (row) => `│${row.map((c) => BLOCKS[c === 0 ? 0 : 1]).join("")}│`,
    );
    this.boardEl.textContent = [top, ...rows, bottom].join("\n");
    this.statusEl.textContent = snap.over
      ? `game over · score ${snap.score} · lines ${snap.lines} · Enter to restart · ^X exit`
      : `score ${snap.score} · lines ${snap.lines} · level ${snap.level} · next ${snap.next} · ←→ move · ↑ rotate · ↓ soft · space drop · ^X exit`;
  }
}

const tetris: Command<CoreCommandContext> = {
  name: "tetris",
  help: "play Tetris (arrows move/rotate, space hard-drop, ^X exit)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new TetrisApp(exit));
  },
};

export const pkg: Package = {
  name: "tetris",
  description: "play Tetris — the falling-blocks classic",
  commands: [tetris],
};
