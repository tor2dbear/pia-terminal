import type { KeySpec, ScreenApp } from "../../terminal/screen.js";
import type { PythonResult } from "./bridge.js";

/** Runs one REPL submission; `onLoading` fires once during a cold Pyodide start. */
export type ReplRunner = (source: string, onLoading: () => void) => Promise<PythonResult>;

/**
 * `python` with no arguments — an interactive REPL, as a screen app. Lines
 * accumulate into a statement; the sandbox reports when the input is still an
 * incomplete block (`def f():`…) so the prompt switches to `...` until it's
 * done. State persists across lines (it's one Pyodide interpreter). A simple
 * line editor with history; `exit()`/`quit()`/`^X`/`^D` leaves.
 */
export class PythonRepl implements ScreenApp {
  private out: string[] = [];
  private pending: string[] = [];
  private buffer = "";
  private history: string[] = [];
  private histIndex = 0;
  private busy = false;
  private cold = true;

  private outEl: HTMLPreElement | undefined;
  private promptEl: HTMLDivElement | undefined;

  constructor(
    private readonly exit: () => void,
    private readonly runner: ReplRunner,
  ) {}

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "pyrepl";
    this.outEl = document.createElement("pre");
    this.outEl.className = "pyrepl-out";
    this.promptEl = document.createElement("div");
    this.promptEl.className = "pyrepl-prompt";
    wrap.append(this.outEl, this.promptEl);
    container.append(wrap);
    this.out.push("Python (Pyodide) — type exit() or press ^X to quit.");
    this.render();
  }

  unmount(): void {
    // Nothing to tear down (the sandbox iframe is shared and persists).
  }

  private promptText(): string {
    return this.pending.length > 0 ? "... " : ">>> ";
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
      return;
    }
    if (this.busy) return;
    if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      if (this.buffer === "" && this.pending.length === 0) this.exit();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      this.submit();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      this.buffer = this.buffer.slice(0, -1);
      this.render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.recall(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      this.recall(1);
    }
  }

  onText(text: string): void {
    if (this.busy) return;
    this.buffer += text.replace(/[\r\n]/g, "");
    this.render();
  }

  keys(): KeySpec[] {
    return [
      { label: "enter", run: () => !this.busy && this.submit() },
      { label: "quit", run: () => this.exit() },
    ];
  }

  private recall(dir: number): void {
    if (this.history.length === 0) return;
    this.histIndex = Math.max(0, Math.min(this.history.length, this.histIndex + dir));
    this.buffer = this.history[this.histIndex] ?? "";
    this.render();
  }

  private submit(): void {
    const line = this.buffer;
    this.out.push(this.promptText() + line);
    this.buffer = "";

    const trimmed = line.trim();
    if (this.pending.length === 0 && (trimmed === "exit()" || trimmed === "quit()")) {
      this.exit();
      return;
    }
    if (trimmed !== "") this.history.push(line);
    this.histIndex = this.history.length;

    this.pending.push(line);
    const source = this.pending.join("\n");
    this.busy = true;
    this.render();

    void this.runner(source, () => {
      if (this.cold) {
        this.cold = false;
        this.out.push("(loading Python…)");
        this.render();
      }
    }).then((res) => {
      this.busy = false;
      if (res.incomplete) {
        this.render(); // keep the block open; prompt is now "..."
        return;
      }
      this.pending = [];
      if (res.stdout) this.pushLines(res.stdout);
      if (res.stderr) this.pushLines(res.stderr);
      if (res.error) this.pushLines(res.error);
      else if (res.result !== null) this.out.push(res.result);
      this.render();
    });
  }

  private pushLines(text: string): void {
    for (const line of text.replace(/\n$/, "").split("\n")) this.out.push(line);
  }

  private render(): void {
    if (this.outEl) {
      this.outEl.textContent = this.out.join("\n");
      this.outEl.scrollTop = this.outEl.scrollHeight;
    }
    if (this.promptEl) {
      this.promptEl.textContent = this.busy
        ? "running…"
        : `${this.promptText()}${this.buffer}█`;
    }
  }

  /** Test hook: a read-only view of the transcript and current prompt. */
  snapshot(): { out: string[]; prompt: string; busy: boolean } {
    return { out: [...this.out], prompt: `${this.promptText()}${this.buffer}`, busy: this.busy };
  }
}
