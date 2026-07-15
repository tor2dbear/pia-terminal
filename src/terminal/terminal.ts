import { HOME } from "../vfs/vfs.js";
import type { VFS } from "../vfs/vfs.js";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  type Command,
  type CommandContext,
  type CommandRegistry,
  type LineClass,
  type Session,
} from "../commands/registry.js";
import { tokenize } from "./parse.js";
import type { ScreenApp, ScreenAppFactory } from "./screen.js";
import type { AuthAdapter } from "../auth/adapter.js";

export interface TerminalOptions {
  vfs: VFS;
  adapter: StorageAdapter;
  registry: CommandRegistry;
  auth: AuthAdapter;
  session: Session;
}

/** Longest common prefix of a list of strings. */
function commonPrefix(items: string[]): string {
  if (items.length === 0) return "";
  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/**
 * The terminal core: owns the screen DOM, the input line (buffer + cursor),
 * command history, Tab-completion, and the read-eval-print loop. Commands
 * reach the outside world only through the {@link CommandContext} it builds.
 */
export class Terminal {
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLDivElement;
  /** Hidden, focusable field: the only reliable way to raise a soft keyboard. */
  private readonly kbd: HTMLInputElement;
  /** Container a full-screen app renders into while it owns the screen. */
  private readonly appEl: HTMLDivElement;
  private activeApp?: ScreenApp;

  private readonly vfs: VFS;
  private readonly adapter: StorageAdapter;
  private readonly registry: CommandRegistry;
  private readonly auth: AuthAdapter;
  private readonly session: Session;

  private cwd = HOME;
  private buffer = "";
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = 0; // points one past the last entry when not browsing
  private busy = false;

  constructor(
    private readonly root: HTMLElement,
    opts: TerminalOptions,
  ) {
    this.vfs = opts.vfs;
    this.adapter = opts.adapter;
    this.registry = opts.registry;
    this.auth = opts.auth;
    this.session = opts.session;

    // Point home and cwd at whoever is logged in, creating the home if needed.
    const home = `/home/${this.session.user}`;
    this.vfs.mkdirp(home);
    this.vfs.home = home;
    this.cwd = home;

    this.kbd = document.createElement("input");
    this.kbd.className = "term-kbd";
    this.kbd.setAttribute("autocomplete", "off");
    this.kbd.setAttribute("autocapitalize", "off");
    this.kbd.setAttribute("autocorrect", "off");
    this.kbd.setAttribute("spellcheck", "false");
    this.kbd.setAttribute("aria-hidden", "true");

    this.outputEl = document.createElement("div");
    this.outputEl.className = "term-output";
    this.appEl = document.createElement("div");
    this.appEl.className = "term-app";
    this.appEl.style.display = "none";
    this.inputEl = document.createElement("div");
    this.inputEl.className = "term-inputline";
    this.root.append(this.kbd, this.outputEl, this.appEl, this.inputEl);

    // Control keys come through keydown; printable text through `input` (which
    // is the only path IMEs and mobile soft keyboards reliably fire). Splitting
    // them keeps a single, un-doubled insertion path on both desktop and phone.
    this.kbd.addEventListener("keydown", this.onKeyDown);
    this.kbd.addEventListener("input", this.onInput);
    this.kbd.addEventListener("compositionend", this.flushKbd);
    this.root.addEventListener("pointerup", this.focusKbd);

    this.focusKbd();
    this.renderInput();
  }

  /** Detach listeners. */
  dispose(): void {
    this.kbd.removeEventListener("keydown", this.onKeyDown);
    this.kbd.removeEventListener("input", this.onInput);
    this.kbd.removeEventListener("compositionend", this.flushKbd);
    this.root.removeEventListener("pointerup", this.focusKbd);
  }

  /** Focus the hidden field so a soft keyboard appears (needs a user gesture). */
  private focusKbd = (): void => {
    this.kbd.focus({ preventScroll: true });
  };

  // ---- output ---------------------------------------------------------------

  /** Append a line of output. */
  print(text = "", cls: LineClass = "normal"): void {
    const line = document.createElement("div");
    line.className = cls === "normal" ? "term-line" : `term-line ${cls}`;
    line.textContent = text;
    this.outputEl.append(line);
    this.scrollToBottom();
  }

  clear(): void {
    this.outputEl.replaceChildren();
  }

  private scrollToBottom(): void {
    this.root.scrollTop = this.root.scrollHeight;
  }

  // ---- prompt + input rendering --------------------------------------------

  private promptText(): string {
    const home = this.vfs.home;
    let shown = this.cwd;
    if (shown === home) shown = "~";
    else if (shown.startsWith(`${home}/`)) shown = `~${shown.slice(home.length)}`;
    return `${this.session.user}@vera:${shown}$`;
  }

  /** Redraw the active input line, with the block cursor at its position. */
  private renderInput(): void {
    this.inputEl.replaceChildren();

    const prompt = document.createElement("span");
    prompt.className = "term-prompt";
    prompt.textContent = this.promptText();

    const typed = document.createElement("span");
    typed.className = "term-typed";

    const before = this.buffer.slice(0, this.cursor);
    const atChar = this.buffer[this.cursor] ?? " ";
    const after = this.buffer.slice(this.cursor + 1);

    typed.append(document.createTextNode(before));
    const cursorEl = document.createElement("span");
    cursorEl.className = "term-cursor";
    cursorEl.textContent = atChar;
    typed.append(cursorEl);
    typed.append(document.createTextNode(after));

    this.inputEl.append(prompt, typed);
    this.scrollToBottom();
  }

  /** Hide the input line while a command runs. */
  private setInputVisible(visible: boolean): void {
    this.inputEl.style.display = visible ? "" : "none";
  }

  // ---- keyboard -------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    // A full-screen app, when present, owns the keyboard entirely.
    if (this.activeApp) {
      this.activeApp.onKey(e);
      return;
    }
    if (this.busy) return;

    // Let browser shortcuts (reload, devtools, copy) through.
    if (e.metaKey || (e.ctrlKey && e.key !== "c" && e.key !== "l")) return;

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        void this.submit();
        return;
      case "Backspace":
        e.preventDefault();
        if (this.cursor > 0) {
          this.buffer =
            this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
          this.cursor--;
          this.renderInput();
        }
        return;
      case "Delete":
        e.preventDefault();
        this.buffer =
          this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
        this.renderInput();
        return;
      case "ArrowLeft":
        e.preventDefault();
        if (this.cursor > 0) this.cursor--;
        this.renderInput();
        return;
      case "ArrowRight":
        e.preventDefault();
        if (this.cursor < this.buffer.length) this.cursor++;
        this.renderInput();
        return;
      case "Home":
        e.preventDefault();
        this.cursor = 0;
        this.renderInput();
        return;
      case "End":
        e.preventDefault();
        this.cursor = this.buffer.length;
        this.renderInput();
        return;
      case "ArrowUp":
        e.preventDefault();
        this.recallHistory(-1);
        return;
      case "ArrowDown":
        e.preventDefault();
        this.recallHistory(1);
        return;
      case "Tab":
        e.preventDefault();
        this.completeTab();
        return;
    }

    if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      this.print(`${this.promptText()} ${this.buffer}^C`, "dim");
      this.resetLine();
      return;
    }
    if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      this.clear();
      return;
    }

    // Printable characters are left to fall into the hidden field and arrive
    // via `onInput` — do not handle them here, or they would double-insert.
  };

  /** Printable text arrives here (desktop typing, mobile keyboard, IME). */
  private onInput = (e: Event): void => {
    if ((e as InputEvent).isComposing) return;
    this.flushKbd();
  };

  /** Move whatever collected in the hidden field to the app or line buffer. */
  private flushKbd = (): void => {
    const text = this.kbd.value;
    this.kbd.value = "";
    if (!text) return;
    if (this.activeApp) {
      this.activeApp.onText(text);
      return;
    }
    if (this.busy) return;
    this.buffer =
      this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
    this.renderInput();
  };

  private resetLine(): void {
    this.buffer = "";
    this.cursor = 0;
    this.historyIndex = this.history.length;
    this.renderInput();
  }

  private recallHistory(direction: -1 | 1): void {
    if (this.history.length === 0) return;
    const next = this.historyIndex + direction;
    if (next < 0) return;
    if (next >= this.history.length) {
      this.historyIndex = this.history.length;
      this.buffer = "";
      this.cursor = 0;
      this.renderInput();
      return;
    }
    this.historyIndex = next;
    this.buffer = this.history[next];
    this.cursor = this.buffer.length;
    this.renderInput();
  }

  // ---- Tab-completion -------------------------------------------------------

  private completeTab(): void {
    const text = this.buffer.slice(0, this.cursor);
    const endsWithSpace = /\s$/.test(text) || text === "";
    const tokens = tokenize(text);
    const index = endsWithSpace ? tokens.length : tokens.length - 1;
    const fragment = endsWithSpace ? "" : (tokens[tokens.length - 1] ?? "");

    const candidates =
      index === 0
        ? this.registry.namesStartingWith(fragment)
        : this.completePath(fragment);

    if (candidates.length === 0) return;

    if (candidates.length === 1) {
      const value = candidates[0];
      const suffix = value.endsWith("/") ? "" : " ";
      this.replaceFragment(fragment, value + suffix);
      return;
    }

    const shared = commonPrefix(candidates.map((c) => c.replace(/\/$/, "")));
    if (shared.length > fragment.length) {
      this.replaceFragment(fragment, shared);
    } else {
      this.print(`${this.promptText()} ${this.buffer}`, "dim");
      this.print(candidates.join("  "));
    }
  }

  /** Filesystem completions for a path fragment, relative to cwd. */
  private completePath(fragment: string): string[] {
    const slash = fragment.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : fragment.slice(0, slash + 1);
    const namePart = slash === -1 ? fragment : fragment.slice(slash + 1);
    const dirAbs = this.vfs.resolve(this.cwd, dirPart || ".");
    const node = this.vfs.getNode(dirAbs);
    if (!node || node.type !== "dir") return [];
    return this.vfs
      .list(dirAbs)
      .filter((entry) => entry.name.startsWith(namePart))
      .map((entry) => dirPart + entry.name + (entry.type === "dir" ? "/" : ""));
  }

  private replaceFragment(fragment: string, replacement: string): void {
    const start = this.cursor - fragment.length;
    this.buffer =
      this.buffer.slice(0, start) + replacement + this.buffer.slice(this.cursor);
    this.cursor = start + replacement.length;
    this.renderInput();
  }

  // ---- read-eval-print ------------------------------------------------------

  private async submit(): Promise<void> {
    const line = this.buffer;
    this.print(`${this.promptText()} ${line}`);
    this.buffer = "";
    this.cursor = 0;

    const trimmed = line.trim();
    if (trimmed === "") {
      this.renderInput();
      return;
    }

    if (this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
    }
    this.historyIndex = this.history.length;

    const tokens = tokenize(trimmed);
    const name = tokens[0];
    const args = tokens.slice(1);
    const command = this.registry.get(name);

    if (!command) {
      this.print(`unknown command: ${name}. type 'help'.`, "error");
      this.renderInput();
      return;
    }

    await this.execute(command, args);
    this.renderInput();
  }

  private async execute(command: Command, args: string[]): Promise<void> {
    this.busy = true;
    this.setInputVisible(false);
    try {
      await command.run(args, this.context());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.print(`error: ${message}`, "error");
    } finally {
      this.busy = false;
      this.setInputVisible(true);
    }
  }

  /** Build the context handed to a command for one invocation. */
  private context(): CommandContext {
    const term = this;
    return {
      vfs: this.vfs,
      session: this.session,
      auth: this.auth,
      registry: this.registry,
      get cwd() {
        return term.cwd;
      },
      setCwd(path: string) {
        term.cwd = path;
      },
      print: (text, cls) => this.print(text, cls),
      error: (text) => this.print(text, "error"),
      clear: () => this.clear(),
      persist: () => this.adapter.save(this.vfs.root),
      runApp: (factory) => this.runApp(factory),
    };
  }

  /** Hand the screen to a full-screen app; resolves when it exits. */
  private runApp(factory: ScreenAppFactory): Promise<void> {
    return new Promise((resolve) => {
      const exit = (): void => {
        this.activeApp?.unmount();
        this.activeApp = undefined;
        this.appEl.replaceChildren();
        this.appEl.style.display = "none";
        this.outputEl.style.display = "";
        this.setInputVisible(true);
        this.focusKbd();
        resolve();
      };
      const app = factory(exit);
      this.activeApp = app;
      this.outputEl.style.display = "none";
      this.setInputVisible(false);
      this.appEl.style.display = "";
      app.mount(this.appEl);
      this.focusKbd();
    });
  }
}
