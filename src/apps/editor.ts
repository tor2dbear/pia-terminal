import type { ScreenApp, KeySpec } from "../terminal/screen.js";

/** One file to open in the editor: its name, initial text, and how it saves. */
export interface BufferSpec {
  filename: string;
  content: string;
  onSave: (content: string) => void | Promise<void>;
}

/** An open buffer: a {@link BufferSpec} plus the live editing state (text +
 * cursor + dirty flag). The editor holds a list of these and shows one at a
 * time, nano-style. */
interface Buffer {
  filename: string;
  lines: string[];
  row: number;
  col: number;
  dirty: boolean;
  onSave: (content: string) => void | Promise<void>;
}

function toBuffer(spec: BufferSpec): Buffer {
  return {
    filename: spec.filename,
    lines: spec.content === "" ? [""] : spec.content.split("\n"),
    row: 0,
    col: 0,
    dirty: false,
    onSave: spec.onSave,
  };
}

/**
 * A minimal full-screen text editor in the nano tradition: a title bar, the
 * text body with a block cursor, and a status bar of key hints. Saves through
 * a callback so it stays unaware of the filesystem.
 *
 * Holds several buffers at once (`nano a b c`) and switches between them like
 * nano — `M-,`/`M-.` (also `M-<`/`M->`), with `[ n/m ]` in the title bar. `^X`
 * closes the current buffer; closing the last one exits.
 *
 * Keys: arrows/Home/End to move, Enter/Backspace/Delete to edit, Ctrl+O to
 * save, Ctrl+X to close/exit (with a confirm when a buffer has unsaved changes).
 */
export class Editor implements ScreenApp {
  private readonly buffers: Buffer[];
  private active = 0;
  private quitArmed = false;
  private message = "";

  private titleEl!: HTMLDivElement;
  private bodyEl!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private hintEl!: HTMLSpanElement;
  private msgEl!: HTMLSpanElement;
  private posEl!: HTMLSpanElement;

  constructor(
    specs: BufferSpec[],
    private readonly exit: () => void,
  ) {
    // Always at least one buffer — callers pass one or more files.
    this.buffers = (specs.length ? specs : [{ filename: "", content: "", onSave: () => {} }]).map(
      toBuffer,
    );
  }

  /** The buffer currently on screen. */
  private get buf(): Buffer {
    return this.buffers[this.active];
  }

  mount(container: HTMLElement): void {
    this.titleEl = document.createElement("div");
    this.titleEl.className = "ed-title";
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "ed-body";
    this.msgEl = document.createElement("span");
    this.msgEl.className = "ed-msg";
    this.posEl = document.createElement("span");
    this.posEl.className = "ed-pos";

    this.statusEl = document.createElement("div");
    this.statusEl.className = "ed-status";
    // Hint text on the left, cursor position on the right. The save/exit/move
    // controls live on the terminal's shared key bar (see keys()). The hint is
    // filled in render() since it depends on how many buffers are open.
    this.hintEl = document.createElement("span");
    this.hintEl.className = "ed-hint";
    this.statusEl.append(this.hintEl, this.msgEl, this.posEl);

    container.append(this.titleEl, this.bodyEl, this.statusEl);
    this.render();
  }

  unmount(): void {
    /* nothing to clean up */
  }

  /** Keys for the on-screen bar — nano's controls, usable without a keyboard.
   * The buffer-switch keys appear only when more than one buffer is open. */
  keys(): KeySpec[] {
    const keys: KeySpec[] = [
      { label: "^O", run: () => void this.save() },
      { label: "^X", run: () => this.requestExit() },
      { label: "←", run: () => this.moveAndRender(() => this.moveLeft()) },
      { label: "→", run: () => this.moveAndRender(() => this.moveRight()) },
      { label: "↑", run: () => this.moveAndRender(() => this.moveVertical(-1)) },
      { label: "↓", run: () => this.moveAndRender(() => this.moveVertical(1)) },
      { label: "Tab", subtle: true, run: () => this.onText("  ") },
    ];
    if (this.buffers.length > 1) {
      keys.push(
        { label: "«", subtle: true, run: () => this.switchBuffer(-1) },
        { label: "»", subtle: true, run: () => this.switchBuffer(1) },
      );
    }
    return keys;
  }

  private moveAndRender(move: () => void): void {
    move();
    this.render();
  }

  // ---- input ---------------------------------------------------------------

  onText(text: string): void {
    this.insert(text);
    this.render();
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      void this.save();
      return;
    }
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.requestExit();
      return;
    }
    // Buffer switching, nano's Meta bindings. Match on physical key (e.code) so
    // it works regardless of layout and of what glyph Alt+, produces on macOS:
    // M-, / M-< → previous, M-. / M-> → next.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.code === "Comma") {
        e.preventDefault();
        this.switchBuffer(-1);
        return;
      }
      if (e.code === "Period") {
        e.preventDefault();
        this.switchBuffer(1);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave other browser shortcuts alone

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
        this.buf.col = 0;
        break;
      case "End":
        e.preventDefault();
        this.buf.col = this.buf.lines[this.buf.row].length;
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
    const buf = this.buf;
    const parts = text.replace(/\r/g, "").split("\n");
    const line = buf.lines[buf.row];
    const tail = line.slice(buf.col);
    buf.lines[buf.row] = line.slice(0, buf.col) + parts[0];
    buf.col = buf.lines[buf.row].length;
    for (let i = 1; i < parts.length; i++) {
      buf.row++;
      buf.lines.splice(buf.row, 0, parts[i]);
      buf.col = parts[i].length;
    }
    buf.lines[buf.row] += tail;
    buf.dirty = true;
    this.quitArmed = false;
  }

  private newline(): void {
    const buf = this.buf;
    const line = buf.lines[buf.row];
    buf.lines[buf.row] = line.slice(0, buf.col);
    buf.lines.splice(buf.row + 1, 0, line.slice(buf.col));
    buf.row++;
    buf.col = 0;
    buf.dirty = true;
  }

  private backspace(): void {
    const buf = this.buf;
    if (buf.col > 0) {
      const line = buf.lines[buf.row];
      buf.lines[buf.row] = line.slice(0, buf.col - 1) + line.slice(buf.col);
      buf.col--;
    } else if (buf.row > 0) {
      const prev = buf.lines[buf.row - 1];
      buf.col = prev.length;
      buf.lines[buf.row - 1] = prev + buf.lines[buf.row];
      buf.lines.splice(buf.row, 1);
      buf.row--;
    } else {
      return;
    }
    buf.dirty = true;
  }

  private forwardDelete(): void {
    const buf = this.buf;
    const line = buf.lines[buf.row];
    if (buf.col < line.length) {
      buf.lines[buf.row] = line.slice(0, buf.col) + line.slice(buf.col + 1);
    } else if (buf.row < buf.lines.length - 1) {
      buf.lines[buf.row] = line + buf.lines[buf.row + 1];
      buf.lines.splice(buf.row + 1, 1);
    } else {
      return;
    }
    buf.dirty = true;
  }

  // ---- movement ------------------------------------------------------------

  private moveLeft(): void {
    const buf = this.buf;
    if (buf.col > 0) buf.col--;
    else if (buf.row > 0) {
      buf.row--;
      buf.col = buf.lines[buf.row].length;
    }
  }

  private moveRight(): void {
    const buf = this.buf;
    if (buf.col < buf.lines[buf.row].length) buf.col++;
    else if (buf.row < buf.lines.length - 1) {
      buf.row++;
      buf.col = 0;
    }
  }

  private moveVertical(delta: number): void {
    const buf = this.buf;
    const next = buf.row + delta;
    if (next < 0 || next >= buf.lines.length) return;
    buf.row = next;
    buf.col = Math.min(buf.col, buf.lines[buf.row].length);
  }

  // ---- buffers -------------------------------------------------------------

  /** Move to the previous/next buffer (wrapping), nano's M-,/M-. */
  private switchBuffer(delta: number): void {
    if (this.buffers.length < 2) return;
    this.active = (this.active + delta + this.buffers.length) % this.buffers.length;
    this.quitArmed = false;
    this.message = `[${this.active + 1}/${this.buffers.length}] ${this.buf.filename}`;
    this.render();
  }

  /** Close the current buffer; exit the editor when the last one closes. */
  private closeActiveBuffer(): void {
    this.buffers.splice(this.active, 1);
    if (this.buffers.length === 0) {
      this.exit();
      return;
    }
    if (this.active >= this.buffers.length) this.active = this.buffers.length - 1;
    this.quitArmed = false;
    this.message = `closed · now editing ${this.buf.filename}`;
    this.render();
  }

  // ---- save / exit ---------------------------------------------------------

  private async save(): Promise<void> {
    const buf = this.buf;
    await buf.onSave(buf.lines.join("\n"));
    buf.dirty = false;
    this.quitArmed = false;
    this.message = `saved ${buf.filename}`;
    this.render();
  }

  /** `^X`: close the current buffer, guarding unsaved changes first. */
  private requestExit(): void {
    if (this.buf.dirty && !this.quitArmed) {
      this.quitArmed = true;
      const what = this.buffers.length > 1 ? "this buffer" : "";
      this.message = `unsaved changes in ${this.buf.filename} — ^X again to discard${
        what ? ` ${what}` : ""
      }, ^O to save`;
      this.render();
      return;
    }
    this.closeActiveBuffer();
  }

  // ---- rendering -----------------------------------------------------------

  private render(): void {
    const buf = this.buf;
    const many = this.buffers.length > 1;
    const pos = many ? `  [${this.active + 1}/${this.buffers.length}]` : "";
    this.titleEl.textContent = `  PIA editor · ${buf.filename}${buf.dirty ? " *" : ""}${pos}`;
    this.hintEl.textContent = many
      ? "^O save · ^X close · «/» M-,/M-. switch buffer"
      : "^O save · ^X exit";

    this.bodyEl.replaceChildren();
    let cursorEl: HTMLElement | null = null;
    buf.lines.forEach((text, r) => {
      const lineEl = document.createElement("div");
      lineEl.className = "ed-line";
      if (r === buf.row) {
        const before = text.slice(0, buf.col);
        const atChar = text[buf.col] ?? " ";
        const after = text.slice(buf.col + 1);
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
    this.posEl.textContent = `Ln ${buf.row + 1}, Col ${buf.col + 1}`;

    // scrollIntoView exists in browsers but not in jsdom; guard so tests pass.
    const cur = cursorEl as HTMLElement | null;
    if (cur && typeof cur.scrollIntoView === "function") {
      cur.scrollIntoView({ block: "nearest" });
    }
  }
}
