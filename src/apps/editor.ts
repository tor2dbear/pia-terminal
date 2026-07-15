import type { ScreenApp } from "../terminal/screen.js";

/**
 * A minimal full-screen text editor in the nano tradition: a title bar, the
 * text body with a block cursor, and a status bar of key hints. Saves through
 * a callback so it stays unaware of the filesystem.
 *
 * Keys: arrows/Home/End to move, Enter/Backspace/Delete to edit, Ctrl+S to
 * save, Ctrl+X to exit (with a confirm when there are unsaved changes).
 */
export class Editor implements ScreenApp {
  private lines: string[];
  private row = 0;
  private col = 0;
  private dirty = false;
  private quitArmed = false;
  private message = "";

  private titleEl!: HTMLDivElement;
  private bodyEl!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private msgEl!: HTMLSpanElement;
  private posEl!: HTMLSpanElement;

  constructor(
    private readonly filename: string,
    content: string,
    private readonly onSave: (content: string) => void | Promise<void>,
    private readonly exit: () => void,
  ) {
    this.lines = content === "" ? [""] : content.split("\n");
  }

  mount(container: HTMLElement): void {
    this.titleEl = document.createElement("div");
    this.titleEl.className = "ed-title";
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "ed-body";

    // Tappable controls so the editor is fully usable on a phone, where there
    // is no Ctrl key to reach ^S / ^X.
    const saveBtn = this.keyButton("^S save", () => void this.save());
    const exitBtn = this.keyButton("^X exit", () => this.requestExit());
    this.msgEl = document.createElement("span");
    this.msgEl.className = "ed-msg";
    this.posEl = document.createElement("span");
    this.posEl.className = "ed-pos";

    this.statusEl = document.createElement("div");
    this.statusEl.className = "ed-status";
    this.statusEl.append(saveBtn, exitBtn, this.msgEl, this.posEl);

    container.append(this.titleEl, this.bodyEl, this.statusEl);
    this.render();
  }

  private keyButton(label: string, onActivate: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ed-key";
    btn.textContent = label;
    btn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      onActivate();
    });
    return btn;
  }

  unmount(): void {
    /* nothing to clean up */
  }

  // ---- input ---------------------------------------------------------------

  onText(text: string): void {
    this.insert(text);
    this.render();
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      void this.save();
      return;
    }
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.requestExit();
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // leave other browser shortcuts alone

    // Any non-quit key cancels a pending "discard changes?" confirmation.
    this.quitArmed = false;

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        this.newline();
        break;
      case "Backspace":
        e.preventDefault();
        this.backspace();
        break;
      case "Delete":
        e.preventDefault();
        this.forwardDelete();
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.moveLeft();
        break;
      case "ArrowRight":
        e.preventDefault();
        this.moveRight();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.moveVertical(-1);
        break;
      case "ArrowDown":
        e.preventDefault();
        this.moveVertical(1);
        break;
      case "Home":
        e.preventDefault();
        this.col = 0;
        break;
      case "End":
        e.preventDefault();
        this.col = this.lines[this.row].length;
        break;
      case "Tab":
        e.preventDefault();
        this.insert("  ");
        break;
      default:
        return; // printable characters arrive via onText
    }
    this.render();
  }

  // ---- editing -------------------------------------------------------------

  private insert(text: string): void {
    const parts = text.replace(/\r/g, "").split("\n");
    const line = this.lines[this.row];
    const tail = line.slice(this.col);
    this.lines[this.row] = line.slice(0, this.col) + parts[0];
    this.col = this.lines[this.row].length;
    for (let i = 1; i < parts.length; i++) {
      this.row++;
      this.lines.splice(this.row, 0, parts[i]);
      this.col = parts[i].length;
    }
    this.lines[this.row] += tail;
    this.dirty = true;
    this.quitArmed = false;
  }

  private newline(): void {
    const line = this.lines[this.row];
    this.lines[this.row] = line.slice(0, this.col);
    this.lines.splice(this.row + 1, 0, line.slice(this.col));
    this.row++;
    this.col = 0;
    this.dirty = true;
  }

  private backspace(): void {
    if (this.col > 0) {
      const line = this.lines[this.row];
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col);
      this.col--;
    } else if (this.row > 0) {
      const prev = this.lines[this.row - 1];
      this.col = prev.length;
      this.lines[this.row - 1] = prev + this.lines[this.row];
      this.lines.splice(this.row, 1);
      this.row--;
    } else {
      return;
    }
    this.dirty = true;
  }

  private forwardDelete(): void {
    const line = this.lines[this.row];
    if (this.col < line.length) {
      this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + 1);
    } else if (this.row < this.lines.length - 1) {
      this.lines[this.row] = line + this.lines[this.row + 1];
      this.lines.splice(this.row + 1, 1);
    } else {
      return;
    }
    this.dirty = true;
  }

  // ---- movement ------------------------------------------------------------

  private moveLeft(): void {
    if (this.col > 0) this.col--;
    else if (this.row > 0) {
      this.row--;
      this.col = this.lines[this.row].length;
    }
  }

  private moveRight(): void {
    if (this.col < this.lines[this.row].length) this.col++;
    else if (this.row < this.lines.length - 1) {
      this.row++;
      this.col = 0;
    }
  }

  private moveVertical(delta: number): void {
    const next = this.row + delta;
    if (next < 0 || next >= this.lines.length) return;
    this.row = next;
    this.col = Math.min(this.col, this.lines[this.row].length);
  }

  // ---- save / exit ---------------------------------------------------------

  private async save(): Promise<void> {
    await this.onSave(this.lines.join("\n"));
    this.dirty = false;
    this.quitArmed = false;
    this.message = `saved ${this.filename}`;
    this.render();
  }

  private requestExit(): void {
    if (!this.dirty) {
      this.exit();
      return;
    }
    if (this.quitArmed) {
      this.exit();
      return;
    }
    this.quitArmed = true;
    this.message = "unsaved changes — ^X again to discard, ^S to save";
    this.render();
  }

  // ---- rendering -----------------------------------------------------------

  private render(): void {
    this.titleEl.textContent = `  VERA editor · ${this.filename}${
      this.dirty ? " *" : ""
    }`;

    this.bodyEl.replaceChildren();
    let cursorEl: HTMLElement | null = null;
    this.lines.forEach((text, r) => {
      const lineEl = document.createElement("div");
      lineEl.className = "ed-line";
      if (r === this.row) {
        const before = text.slice(0, this.col);
        const atChar = text[this.col] ?? " ";
        const after = text.slice(this.col + 1);
        lineEl.append(document.createTextNode(before));
        const cur = document.createElement("span");
        cur.className = "ed-cursor";
        cur.textContent = atChar;
        lineEl.append(cur);
        lineEl.append(document.createTextNode(after));
        cursorEl = cur;
      } else {
        // A trailing zero-width space keeps empty lines from collapsing.
        lineEl.textContent = text === "" ? "​" : text;
      }
      this.bodyEl.append(lineEl);
    });

    this.msgEl.textContent = this.message;
    this.message = "";
    this.posEl.textContent = `Ln ${this.row + 1}, Col ${this.col + 1}`;

    // scrollIntoView exists in browsers but not in jsdom; guard so tests pass.
    const cur = cursorEl as HTMLElement | null;
    if (cur && typeof cur.scrollIntoView === "function") {
      cur.scrollIntoView({ block: "nearest" });
    }
  }
}
