import type { ScreenApp, KeySpec } from "../terminal/screen.js";

interface Item {
  text: string;
  done: boolean;
}

/** Parse a `.list` file into items. Lenient: a bare line is an open item. */
function parse(content: string): Item[] {
  const items: Item[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") continue;
    const m = line.match(/^\[([ xX])\]\s?(.*)$/);
    if (m) items.push({ done: m[1].toLowerCase() === "x", text: m[2] });
    else items.push({ done: false, text: line.trim() });
  }
  return items;
}

/**
 * A checklist app, stored as a plain `.list` file so it's `cat`-able,
 * `nano`-editable, and `share`-able. Navigate with ↑/↓ (or j/k), toggle with
 * space/Enter, add with `+`/`a`, delete with `⌫`/`d`. Auto-saves on change.
 */
export class Todo implements ScreenApp {
  private items: Item[];
  private sel = 0;
  private mode: "normal" | "add" = "normal";
  private draft = "";

  private titleEl: HTMLDivElement | undefined;
  private bodyEl: HTMLDivElement | undefined;
  private statusEl: HTMLDivElement | undefined;

  constructor(
    private readonly filename: string,
    content: string,
    private readonly onSave: (content: string) => void | Promise<void>,
    private readonly exit: () => void,
  ) {
    this.items = parse(content);
    if (this.items.length === 0) this.mode = "add"; // let them type right away
  }

  mount(container: HTMLElement): void {
    this.titleEl = document.createElement("div");
    this.titleEl.className = "td-title";
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "td-body";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "td-status";
    container.append(this.titleEl, this.bodyEl, this.statusEl);
    this.render();
  }

  unmount(): void {
    /* nothing to clean up */
  }

  // ---- input ---------------------------------------------------------------

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
      return;
    }
    if (this.mode === "add") {
      if (e.key === "Enter") {
        e.preventDefault();
        this.commitDraft();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        this.draft = this.draft.slice(0, -1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.mode = "normal";
        this.draft = "";
      } else {
        return;
      }
      this.render();
      return;
    }
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        this.move(-1);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.move(1);
        break;
      case "Enter":
        e.preventDefault();
        this.toggle();
        break;
      case "Backspace":
      case "Delete":
        e.preventDefault();
        this.remove();
        break;
      default:
        return;
    }
    this.render();
  }

  onText(text: string): void {
    for (const ch of text) {
      if (this.mode === "add") {
        this.draft += ch;
        continue;
      }
      if (ch === "a" || ch === "n" || ch === "+") this.mode = "add";
      else if (ch === "j") this.move(1);
      else if (ch === "k") this.move(-1);
      else if (ch === " " || ch === "x") this.toggle();
      else if (ch === "d") this.remove();
    }
    this.render();
  }

  keys(): KeySpec[] {
    if (this.mode === "add") {
      return [
        { label: "esc", run: () => this.act(() => this.cancelAdd()) },
        { label: "^X", run: () => this.exit() },
      ];
    }
    return [
      { label: "+", run: () => this.act(() => (this.mode = "add")) },
      { label: "✓", run: () => this.act(() => this.toggle()) },
      { label: "⌫", run: () => this.act(() => this.remove()) },
      { label: "↑", run: () => this.act(() => this.move(-1)) },
      { label: "↓", run: () => this.act(() => this.move(1)) },
      { label: "^X", run: () => this.exit() },
    ];
  }

  private act(fn: () => void): void {
    fn();
    this.render();
  }

  /**
   * Replace the items from an external update (a co-editor's save arriving via
   * live-sync), preserving the cursor and any in-progress add draft. A no-op if
   * nothing actually changed — including the echo of our own save.
   */
  applyExternal(content: string): void {
    if (content === this.serialize()) return;
    this.items = parse(content);
    this.sel = Math.max(0, Math.min(this.sel, this.items.length - 1));
    this.render();
  }

  // ---- mutations (no render — callers render once) --------------------------

  private move(delta: number): void {
    if (this.items.length === 0) return;
    this.sel = Math.max(0, Math.min(this.items.length - 1, this.sel + delta));
  }

  private toggle(): void {
    const item = this.items[this.sel];
    if (!item) return;
    item.done = !item.done;
    this.save();
  }

  private remove(): void {
    if (!this.items[this.sel]) return;
    this.items.splice(this.sel, 1);
    this.sel = Math.max(0, Math.min(this.sel, this.items.length - 1));
    this.save();
  }

  private commitDraft(): void {
    const text = this.draft.trim();
    if (text) {
      this.items.push({ text, done: false });
      this.sel = this.items.length - 1;
      this.save();
    }
    this.mode = "normal";
    this.draft = "";
  }

  private cancelAdd(): void {
    this.mode = "normal";
    this.draft = "";
  }

  private save(): void {
    void this.onSave(this.serialize());
  }

  private serialize(): string {
    return this.items.map((i) => `[${i.done ? "x" : " "}] ${i.text}`).join("\n");
  }

  /** Read-only view of state, for tests. */
  snapshot(): { items: Item[]; sel: number; mode: string } {
    return { items: this.items.map((i) => ({ ...i })), sel: this.sel, mode: this.mode };
  }

  // ---- rendering -----------------------------------------------------------

  private render(): void {
    if (!this.bodyEl || !this.titleEl || !this.statusEl) return;

    this.titleEl.textContent = `  todo · ${this.filename}`;

    this.bodyEl.replaceChildren();
    if (this.items.length === 0 && this.mode !== "add") {
      const empty = document.createElement("div");
      empty.className = "td-empty";
      empty.textContent = "empty — press + to add an item";
      this.bodyEl.append(empty);
    }
    this.items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = i === this.sel ? "td-row sel" : "td-row";
      const box = document.createElement("span");
      box.className = item.done ? "td-check done" : "td-check";
      box.textContent = item.done ? "[x] " : "[ ] ";
      const text = document.createElement("span");
      text.className = item.done ? "td-text done" : "td-text";
      text.textContent = item.text;
      row.append(box, text);
      this.bodyEl!.append(row);
    });
    if (this.mode === "add") {
      const add = document.createElement("div");
      add.className = "td-add";
      add.textContent = `+ ${this.draft}`;
      const cursor = document.createElement("span");
      cursor.className = "td-cursor";
      cursor.textContent = " ";
      add.append(cursor);
      this.bodyEl.append(add);
    }

    const open = this.items.filter((i) => !i.done).length;
    const done = this.items.length - open;
    this.statusEl.textContent =
      this.mode === "add"
        ? "type an item · Enter to add · esc to cancel · ^X exit"
        : `${open} open · ${done} done   space toggle · + add · ⌫ del · ^X exit`;
  }
}
