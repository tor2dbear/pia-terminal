import type { ScreenApp, KeySpec } from "../terminal/screen.js";

/** Rows to show when the viewport height can't be measured (e.g. in tests). */
const DEFAULT_ROWS = 20;

/**
 * A read-only pager in the `less`/`more` tradition: shows one screenful of text
 * and scrolls through the rest instead of letting it flood past. A full-screen
 * {@link ScreenApp}; it renders a window of `rows` lines from `top`.
 *
 * Keys: Space / `f` / PageDown page down, `b` / PageUp page up, ↑↓ / `j``k`
 * scroll a line, `g` / `G` jump to start / end, `q` / Esc quit. Physical
 * printable keys arrive via {@link onText}, special keys via {@link onKey}, so
 * each key is handled in exactly one place.
 */
export class Pager implements ScreenApp {
  private lines: string[];
  private top = 0;
  private rows = DEFAULT_ROWS;

  private titleEl?: HTMLDivElement;
  private bodyEl?: HTMLDivElement;
  private statusEl?: HTMLDivElement;

  constructor(
    private readonly title: string,
    content: string,
    private readonly exit: () => void,
  ) {
    this.lines = content.split(/\r?\n/);
    // Drop the empty line a trailing newline leaves, so it isn't a blank page.
    if (this.lines.length > 1 && this.lines[this.lines.length - 1] === "") {
      this.lines.pop();
    }
  }

  mount(container: HTMLElement): void {
    // Reuse the editor's presentational chrome (title / scroll body / status).
    this.titleEl = document.createElement("div");
    this.titleEl.className = "ed-title";
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "ed-body";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "ed-status";
    container.append(this.titleEl, this.bodyEl, this.statusEl);
    this.render();
    this.fitRows();
  }

  unmount(): void {
    /* nothing to clean up */
  }

  keys(): KeySpec[] {
    return [
      { label: "Spc", run: () => this.page(1) },
      { label: "b", run: () => this.page(-1) },
      { label: "↑", run: () => this.scroll(-1) },
      { label: "↓", run: () => this.scroll(1) },
      { label: "g", subtle: true, run: () => this.goto(0) },
      { label: "G", subtle: true, run: () => this.goto(Infinity) },
      { label: "q", run: () => this.exit() },
    ];
  }

  onText(text: string): void {
    for (const ch of text) {
      if (ch === "q") return this.exit();
      if (ch === " " || ch === "f") this.page(1);
      else if (ch === "b") this.page(-1);
      else if (ch === "j") this.scroll(1);
      else if (ch === "k") this.scroll(-1);
      else if (ch === "g") this.goto(0);
      else if (ch === "G") this.goto(Infinity);
    }
  }

  onKey(e: KeyboardEvent): void {
    switch (e.key) {
      case "q":
      case "Escape":
        e.preventDefault();
        return this.exit();
      case "PageDown":
        e.preventDefault();
        return this.page(1);
      case "PageUp":
        e.preventDefault();
        return this.page(-1);
      case "ArrowDown":
        e.preventDefault();
        return this.scroll(1);
      case "ArrowUp":
        e.preventDefault();
        return this.scroll(-1);
      case "Home":
        e.preventDefault();
        return this.goto(0);
      case "End":
        e.preventDefault();
        return this.goto(Infinity);
      default:
        return; // printable keys arrive via onText
    }
  }

  /** Model snapshot for tests — no DOM needed. */
  snapshot(): { top: number; rows: number; total: number; atEnd: boolean } {
    return { top: this.top, rows: this.rows, total: this.lines.length, atEnd: this.atEnd() };
  }

  /** The lines currently on screen. */
  visible(): string[] {
    return this.lines.slice(this.top, this.top + this.rows);
  }

  // ---- scrolling -----------------------------------------------------------

  private maxTop(): number {
    return Math.max(0, this.lines.length - this.rows);
  }

  private atEnd(): boolean {
    return this.top >= this.maxTop();
  }

  private page(dir: number): void {
    this.goto(this.top + dir * this.rows);
  }

  private scroll(dir: number): void {
    this.goto(this.top + dir);
  }

  private goto(target: number): void {
    this.top = Math.max(0, Math.min(this.maxTop(), target));
    this.render();
  }

  // ---- rendering -----------------------------------------------------------

  /** Best-effort fit of the page size to the viewport; keeps the default when
   * the height can't be measured (headless / jsdom). */
  private fitRows(): void {
    const body = this.bodyEl;
    if (!body) return;
    // Measure a dedicated single-line probe, not the first content row — a long
    // first line that wraps would otherwise report a multi-row block height and
    // shrink the page to one or two lines.
    const probe = document.createElement("div");
    probe.className = "ed-line";
    probe.textContent = "x";
    body.append(probe);
    const lineH = probe.getBoundingClientRect().height;
    probe.remove();
    const bodyH = body.getBoundingClientRect().height;
    if (bodyH > 0 && lineH > 0) {
      this.rows = Math.max(1, Math.floor(bodyH / lineH));
      this.goto(this.top); // re-clamp and re-render at the measured size
    }
  }

  private render(): void {
    if (!this.titleEl || !this.bodyEl || !this.statusEl) return; // not mounted

    this.titleEl.textContent = `  ${this.title}`;

    this.bodyEl.replaceChildren();
    for (const text of this.visible()) {
      const line = document.createElement("div");
      line.className = "ed-line";
      // A zero-width space keeps a blank line from collapsing.
      line.textContent = text === "" ? "​" : text;
      this.bodyEl.append(line);
    }

    this.statusEl.replaceChildren();
    const hint = document.createElement("span");
    hint.className = "ed-msg";
    hint.textContent = "Space/b page · ↑↓ line · g/G ends · q quit";
    const pos = document.createElement("span");
    pos.className = "ed-pos";
    const shown = Math.min(this.top + this.rows, this.lines.length);
    pos.textContent = this.atEnd() ? "(END)" : `${shown}/${this.lines.length}`;
    this.statusEl.append(hint, pos);
  }
}
