import { HOME, VFS } from "../vfs/vfs.js";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  type CommandContext,
  type CoreCommandContext,
  type CommandRegistry,
  type LineClass,
  type PickResult,
  type Session,
} from "../commands/registry.js";
import { tokenize, parseSequence, type Pipeline } from "./parse.js";
import { expandArgs, unescapeWild, type GlobFs } from "./glob.js";
import type { ScreenApp, ScreenAppFactory, KeySpec } from "./screen.js";

/** A do-nothing storage adapter: the engine default when an app has no backend
 * (e.g. the adventure example). Nothing to load, saves are dropped. */
const NULL_ADAPTER: StorageAdapter = {
  async load() {
    return null;
  },
  async save() {},
};

/** Prompt + aliases the terminal renders — the engine's view of user config,
 * independent of any file format or theme system. */
export interface TerminalConfig {
  /** Prompt template with `{user}` `{host}` `{cwd}` placeholders. */
  prompt?: string;
  /** Command shortcuts: alias name → its expansion. */
  aliases?: Record<string, string>;
}

export interface TerminalOptions<Ctx extends CoreCommandContext = CommandContext> {
  /** The commands this shell offers. Its context type `Ctx` decides what the
   * commands can reach — {@link CommandContext} (PIA) or a leaner core. */
  registry: CommandRegistry<Ctx>;
  /** The filesystem. Omitted → a fresh empty tree (a shell with no persistence,
   * like the adventure example). */
  vfs?: VFS;
  /** Storage backend for persistence. Omitted → a null adapter (saves dropped). */
  adapter?: StorageAdapter;
  /** Who's at the prompt. Omitted → a generic `user`. */
  session?: Session;
  /**
   * Add app-specific fields to the engine's core context, turning a
   * {@link CoreCommandContext} into the app's own `Ctx` (PIA adds auth, share,
   * baseUrl). Omitted → the commands run on the core context alone. Called once
   * per command invocation, so it may read live state.
   */
  extendContext?: (core: CoreCommandContext) => Ctx;
  /**
   * Supply the prompt + aliases (and apply any theme as a side effect). Called
   * at boot and again whenever a command triggers `applyConfig`. Omitted → the
   * built-in default prompt and no aliases. This seam keeps the engine unaware
   * of PIA's dotfile format and theming.
   */
  configure?: () => TerminalConfig;
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
 * Decode uploaded bytes to text: UTF-8, falling back to Windows-1252 for legacy
 * files (e.g. Excel CSV exports). Returns null for binary — a NUL byte, which
 * text never contains but images/PDFs/archives do.
 */
function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * The terminal core: owns the screen DOM, the input line (buffer + cursor),
 * command history, Tab-completion, and the read-eval-print loop. Commands
 * reach the outside world only through the {@link CommandContext} it builds.
 */
export class Terminal<Ctx extends CoreCommandContext = CommandContext> {
  private readonly outputEl: HTMLDivElement;
  private readonly inputEl: HTMLDivElement;
  /** Visible layer of the input line (the field overlays it). */
  private readonly displayEl: HTMLDivElement;
  /** Hidden, focusable field: the only reliable way to raise a soft keyboard. */
  private readonly kbd: HTMLInputElement;
  /** Container a full-screen app renders into while it owns the screen. */
  private readonly appEl: HTMLDivElement;
  private activeApp?: ScreenApp;
  /** On-screen key bar — the keys a phone keyboard lacks (Tab, arrows, |, …). */
  private readonly keybarEl: HTMLDivElement;

  private readonly vfs: VFS;
  private readonly adapter: StorageAdapter;
  private readonly registry: CommandRegistry<Ctx>;
  private readonly session: Session;
  private readonly extendContext?: (core: CoreCommandContext) => Ctx;
  private readonly configure?: () => TerminalConfig;

  private cwd = HOME;
  private buffer = "";
  private cursor = 0;
  /** Prompt template (from `configure`) — placeholders {user} {host} {cwd}. */
  private promptTemplate = "{user}@pia:{cwd}$";
  /** User-defined command shortcuts (from `configure`). */
  private aliases = new Map<string, string>();
  private history: string[] = [];
  private historyIndex = 0; // points one past the last entry when not browsing
  private suggestionIndex = 0; // which of several matches the ghost shows
  private busy = false;

  constructor(
    private readonly root: HTMLElement,
    opts: TerminalOptions<Ctx>,
  ) {
    this.vfs = opts.vfs ?? VFS.seed();
    this.adapter = opts.adapter ?? NULL_ADAPTER;
    this.registry = opts.registry;
    this.session = opts.session ?? { user: "user" };
    this.extendContext = opts.extendContext;
    this.configure = opts.configure;

    // Point home and cwd at whoever is logged in, creating the home if needed.
    const home = `/home/${this.session.user}`;
    this.vfs.mkdirp(home);
    this.vfs.home = home;
    this.cwd = home;

    // Pull the prompt + aliases (and apply any theme) via `configure` before
    // the first render.
    this.loadConfig();

    this.kbd = document.createElement("input");
    this.kbd.className = "term-kbd";
    this.kbd.setAttribute("autocomplete", "off");
    this.kbd.setAttribute("autocapitalize", "off");
    this.kbd.setAttribute("autocorrect", "off");
    this.kbd.setAttribute("spellcheck", "false");

    this.outputEl = document.createElement("div");
    this.outputEl.className = "term-output";
    this.appEl = document.createElement("div");
    this.appEl.className = "term-app";
    this.appEl.style.display = "none";
    // The input line has two layers: a visible display (prompt + typed text +
    // block cursor + ghost) and, on top of it, the real capture field as a
    // transparent overlay. Being a reachable, focused input is what lets the
    // native long-press → Paste work (incl. cross-app), like any web input.
    this.inputEl = document.createElement("div");
    this.inputEl.className = "term-inputline";
    this.displayEl = document.createElement("div");
    this.displayEl.className = "term-display";
    this.inputEl.append(this.displayEl, this.kbd);
    this.keybarEl = document.createElement("div");
    this.keybarEl.className = "term-keybar";
    this.root.append(
      this.outputEl,
      this.appEl,
      this.inputEl,
      this.keybarEl,
    );

    // Control keys come through keydown; printable text through `input` (which
    // is the only path IMEs and mobile soft keyboards reliably fire). Splitting
    // them keeps a single, un-doubled insertion path on both desktop and phone.
    this.kbd.addEventListener("keydown", this.onKeyDown);
    this.kbd.addEventListener("input", this.onInput);
    this.kbd.addEventListener("compositionend", this.flushKbd);
    this.root.addEventListener("pointerup", this.onRootTap);
    this.root.addEventListener("pointerdown", this.onGestureStart);
    this.root.addEventListener("pointerup", this.onGestureEnd);
    window.visualViewport?.addEventListener("resize", this.syncViewport);
    window.visualViewport?.addEventListener("scroll", this.syncViewport);

    this.focusKbd();
    this.renderInput();
    this.renderKeybar();
  }

  /** Detach listeners. */
  dispose(): void {
    this.kbd.removeEventListener("keydown", this.onKeyDown);
    this.kbd.removeEventListener("input", this.onInput);
    this.kbd.removeEventListener("compositionend", this.flushKbd);
    this.root.removeEventListener("pointerup", this.onRootTap);
    this.root.removeEventListener("pointerdown", this.onGestureStart);
    this.root.removeEventListener("pointerup", this.onGestureEnd);
    window.visualViewport?.removeEventListener("resize", this.syncViewport);
    window.visualViewport?.removeEventListener("scroll", this.syncViewport);
  }

  /** Focus the hidden field so a soft keyboard appears (needs a user gesture). */
  private focusKbd = (): void => {
    this.kbd.focus({ preventScroll: true });
  };

  /**
   * Tapping content raises the keyboard, but tapping a control (key bar, ghost,
   * cursor) must not — that's what let the keyboard pop up unexpectedly and
   * cover the bar. preventDefault on those buttons preserves existing focus.
   */
  private onRootTap = (e: PointerEvent): void => {
    // Leave an active text selection alone — focusing the hidden input would
    // collapse it and make copying output impossible.
    if ((window.getSelection()?.toString().length ?? 0) > 0) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        "button, .term-ghost, .term-more, .term-cursor, .term-keybar",
      )
    ) {
      return;
    }
    this.focusKbd();
  };

  /** Insert the clipboard's text at the cursor (or into the active app). */
  private pasteFromClipboard = async (): Promise<void> => {
    if (!navigator.clipboard?.readText) {
      this.print("paste: this browser blocks clipboard reads", "error");
      return;
    }
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      this.print(
        denied
          ? "paste: iOS won't let a web page read another app's clipboard (a limit of this custom input, not your clipboard). Same-origin copy/paste works."
          : `paste: ${err instanceof Error ? err.message : "blocked"}`,
        "error",
      );
      return;
    }
    if (!text) return;
    if (this.activeApp) {
      this.activeApp.onText(text);
      this.renderKeybar();
    } else if (!this.busy) {
      this.insertText(text);
    }
    this.focusKbd();
  };

  /**
   * Ride the key bar above the on-screen keyboard and shrink the app to the
   * space above it. iOS Safari ignores `interactive-widget`, so we track the
   * visual viewport ourselves.
   */
  private syncViewport = (): void => {
    const vv = window.visualViewport;
    if (!vv) return;
    const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    this.root.style.height = overlap > 0 ? `${vv.height}px` : "";
    this.keybarEl.style.transform = overlap > 0 ? `translateY(-${overlap}px)` : "";
  };

  // ---- swipe gestures -------------------------------------------------------

  private gestureX = 0;
  private gestureY = 0;
  private gesturing = false;

  private onGestureStart = (e: PointerEvent): void => {
    // Not while an app owns the screen, and not when starting on a tappable
    // control (bar key, ghost, +N) — those are taps, not swipes.
    if (this.activeApp) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, .term-ghost, .term-more")) return;
    this.gesturing = true;
    this.gestureX = e.clientX;
    this.gestureY = e.clientY;
  };

  /** A horizontal swipe scrubs the cursor; vertical is left to native scroll. */
  private onGestureEnd = (e: PointerEvent): void => {
    if (!this.gesturing) return;
    this.gesturing = false;
    const dx = e.clientX - this.gestureX;
    const dy = e.clientY - this.gestureY;
    if (Math.abs(dx) < 24 || Math.abs(dx) <= Math.abs(dy)) return;
    const steps = Math.round(dx / 22); // ~one character per 22px
    const next = Math.max(0, Math.min(this.buffer.length, this.cursor + steps));
    if (next !== this.cursor) {
      this.cursor = next;
      this.suggestionIndex = 0;
      this.renderInput();
    }
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

  /**
   * (Re)load the prompt template and aliases from the injected `configure`
   * (which also applies any theme as a side effect). Called at boot and again
   * by the `theme`/`alias` commands via `applyConfig`.
   */
  private loadConfig(): void {
    const cfg = this.configure?.() ?? {};
    this.promptTemplate = cfg.prompt || "{user}@pia:{cwd}$";
    this.aliases = new Map(Object.entries(cfg.aliases ?? {}));
  }

  /**
   * Open the OS file picker and resolve with the chosen file's text (or null if
   * cancelled). No terminal equivalent — an accepted web divergence, used by
   * `upload`.
   */
  private pickFile(): Promise<PickResult> {
    const MAX_BYTES = 1_048_576; // 1 MB — comfortably under the localStorage quota
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      // A hint toward text files — the VFS stores text. Not a hard filter.
      input.accept = "text/*,.md,.json,.csv,.log,.yml,.yaml,.sh,.ts,.js,.css,.html,.xml,.ini";
      input.style.display = "none";
      let settled = false;
      const done = (v: PickResult): void => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(v);
      };
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return done(null);
        // Reject oversized files before reading them into memory or the VFS.
        if (file.size > MAX_BYTES) return done({ error: "too-large" });
        const reader = new FileReader();
        reader.onload = () => {
          const text = decodeText(new Uint8Array(reader.result as ArrayBuffer));
          done(text === null ? { error: "binary" } : { name: file.name, content: text });
        };
        reader.onerror = () => done(null);
        reader.readAsArrayBuffer(file);
      });
      input.addEventListener("cancel", () => done(null)); // picker dismissed
      document.body.append(input);
      input.click();
    });
  }

  /** Trigger a browser download of `content` as a file named `name`. */
  private saveFile(name: string, content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private promptText(): string {
    const home = this.vfs.home;
    let shown = this.cwd;
    if (shown === home) shown = "~";
    else if (shown.startsWith(`${home}/`)) shown = `~${shown.slice(home.length)}`;
    return this.promptTemplate
      .replaceAll("{user}", this.session.user)
      .replaceAll("{host}", "pia")
      .replaceAll("{cwd}", shown);
  }

  /** Redraw the active input line, with the block cursor at its position. */
  private renderInput(): void {
    this.displayEl.replaceChildren();

    const prompt = document.createElement("span");
    prompt.className = "term-prompt";
    prompt.textContent = this.promptText();

    const typed = document.createElement("span");
    typed.className = "term-typed";

    const state = this.suggestionState();
    if (state) {
      // Cursor sits on the first ghost char; the rest trails dimmed. The whole
      // suggestion is tappable to accept it (fish-style, but for touch).
      const ghost = state.suffix;
      typed.append(document.createTextNode(this.buffer));
      const cursorEl = document.createElement("span");
      cursorEl.className = "term-cursor accept"; // tappable to accept, over the field
      cursorEl.textContent = ghost[0];
      const restEl = document.createElement("span");
      restEl.className = "term-ghost";
      restEl.textContent = ghost.slice(1);
      const accept = (e: Event): void => {
        e.preventDefault();
        this.acceptSuggestion();
      };
      cursorEl.addEventListener("pointerdown", accept);
      restEl.addEventListener("pointerdown", accept);
      typed.append(cursorEl, restEl);
      if (state.more > 0) {
        // Tappable "+N" chip: how many other matches; tap to cycle to the next.
        const moreEl = document.createElement("span");
        moreEl.className = "term-more";
        moreEl.textContent = ` +${state.more}`;
        moreEl.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          this.cycleSuggestion();
        });
        typed.append(moreEl);
      }
    } else {
      const before = this.buffer.slice(0, this.cursor);
      const atChar = this.buffer[this.cursor] ?? " ";
      const after = this.buffer.slice(this.cursor + 1);
      typed.append(document.createTextNode(before));
      const cursorEl = document.createElement("span");
      cursorEl.className = "term-cursor";
      cursorEl.textContent = atChar;
      typed.append(cursorEl);
      typed.append(document.createTextNode(after));
    }

    this.displayEl.append(prompt, typed);
    this.scrollToBottom();
  }

  // ---- inline autosuggestion (ghost text) ----------------------------------

  /** Completions for the token at the end of `text` (command or path). */
  private completions(text: string): { fragment: string; candidates: string[] } {
    const endsWithSpace = /\s$/.test(text) || text === "";
    const tokens = tokenize(text);
    const index = endsWithSpace ? tokens.length : tokens.length - 1;
    const fragment = endsWithSpace ? "" : (tokens[tokens.length - 1] ?? "");
    const candidates =
      index === 0
        ? this.registry.namesStartingWith(fragment)
        : this.completePath(fragment);
    return { fragment, candidates };
  }

  /** The current suggestion: the ghost suffix plus how many other matches. */
  private suggestionState(): { suffix: string; more: number } | null {
    if (this.cursor !== this.buffer.length) return null; // only at end of line
    const { fragment, candidates } = this.completions(this.buffer);
    if (fragment === "" || candidates.length === 0) return null;
    const chosen = candidates[this.suggestionIndex % candidates.length];
    if (!chosen.startsWith(fragment)) return null;
    const suffix = chosen.slice(fragment.length);
    if (suffix === "") return null; // already fully typed
    return { suffix, more: candidates.length - 1 };
  }

  private suggestion(): string {
    return this.suggestionState()?.suffix ?? "";
  }

  /** Accept the current ghost suggestion, appending it to the line. */
  private acceptSuggestion(): void {
    const ghost = this.suggestion();
    if (!ghost) return;
    this.buffer += ghost;
    this.cursor = this.buffer.length;
    this.suggestionIndex = 0;
    this.renderInput();
  }

  /** Cycle the ghost to the next match (for the +N indicator and Tab). */
  private cycleSuggestion(): void {
    this.suggestionIndex++;
    this.renderInput();
  }

  /** Tab: accept a lone match, cycle when there are several, else list. */
  private onTab(): void {
    const state = this.suggestionState();
    if (state) {
      if (state.more === 0) this.acceptSuggestion();
      else this.cycleSuggestion();
      return;
    }
    this.completeTab(); // mid-line or after a space
  }

  /** Move the cursor right, or accept the suggestion when already at the end. */
  private cursorRight(): void {
    if (this.cursor < this.buffer.length) {
      this.cursor++;
      this.renderInput();
    } else {
      this.acceptSuggestion();
    }
  }

  /** Hide the input line while a command runs. */
  private setInputVisible(visible: boolean): void {
    // Collapse (not display:none) so the capture field — now a child of the
    // input line — stays in the DOM and focusable while a command or app runs.
    this.inputEl.classList.toggle("collapsed", !visible);
  }

  // ---- keyboard -------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    // A full-screen app, when present, owns the keyboard entirely.
    if (this.activeApp) {
      this.activeApp.onKey(e);
      this.renderKeybar(); // the app's keys may have changed (e.g. mode switch)
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
          this.suggestionIndex = 0;
          this.renderInput();
        }
        return;
      case "Delete":
        e.preventDefault();
        this.buffer =
          this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
        this.suggestionIndex = 0;
        this.renderInput();
        return;
      case "ArrowLeft":
        e.preventDefault();
        if (this.cursor > 0) this.cursor--;
        this.renderInput();
        return;
      case "ArrowRight":
        e.preventDefault();
        this.cursorRight();
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
        this.onTab();
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
      this.renderKeybar();
      return;
    }
    if (this.busy) return;
    this.insertText(text);
  };

  /** Insert text at the cursor and redraw the input line. */
  private insertText(text: string): void {
    this.buffer =
      this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
    this.suggestionIndex = 0;
    this.renderInput();
  }

  private resetLine(): void {
    this.buffer = "";
    this.cursor = 0;
    this.suggestionIndex = 0;
    this.historyIndex = this.history.length;
    this.renderInput();
  }

  private recallHistory(direction: -1 | 1): void {
    if (this.history.length === 0) return;
    this.suggestionIndex = 0;
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
    const { fragment, candidates } = this.completions(this.buffer.slice(0, this.cursor));
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
    this.suggestionIndex = 0;
    this.renderInput();
  }

  // ---- read-eval-print ------------------------------------------------------

  /**
   * Run a command line programmatically, as if the user had typed it and
   * pressed Enter (the prompt + line are echoed, then it executes). Used to seed
   * a session — e.g. a published folder that auto-runs `ls` on open — and by
   * tests. No-op while another command is running.
   */
  async exec(line: string): Promise<void> {
    if (this.busy) return;
    this.buffer = line;
    this.cursor = line.length;
    await this.submit();
  }

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

    const parsed = parseSequence(trimmed);
    if (!parsed.ok) {
      this.print(parsed.error, "error");
      this.renderInput();
      return;
    }

    this.busy = true;
    this.setInputVisible(false);
    try {
      // Run each pipeline in turn; `&&` skips on the previous failure, `||`
      // skips on the previous success, `;` always runs. A skipped pipeline
      // leaves the running status untouched, like a real shell.
      let ok = true;
      for (const item of parsed.items) {
        if (item.connector === "&&" && !ok) continue;
        if (item.connector === "||" && ok) continue;
        ok = await this.executePipeline(item.pipeline);
      }
    } finally {
      this.busy = false;
      this.setInputVisible(true);
    }
    this.renderInput();
  }

  /** Run one pipeline (each stage's captured output feeds the next); returns
   * whether it succeeded — i.e. no stage reported an error. */
  private async executePipeline(pipeline: Pipeline): Promise<boolean> {
    const { stages, redirect } = pipeline;
    if (stages.length === 0) return true;

    const status = { failed: false };
    try {
      let input = "";
      // Filesystem view for globbing: resolve paths and list a directory.
      const globFs: GlobFs = {
        resolve: (cwd, path) => this.vfs.resolve(cwd, path),
        entries: (dirAbs) => {
          const node = this.vfs.getNode(dirAbs);
          return node?.type === "dir"
            ? this.vfs.list(dirAbs).map((entry) => entry.name)
            : null;
        },
      };
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        // Expand a user alias once (no recursion): `ll` → `ls -la`, with the
        // alias's own words prepended to whatever args were typed.
        let name = stage.name;
        let args = stage.args;
        const alias = this.aliases.get(name);
        if (alias) {
          // Tokenize like the main parser so a quoted argument in the alias
          // (e.g. `alias notes = cat "my notes.txt"`) stays a single arg.
          const words = tokenize(alias);
          if (words.length > 0) {
            name = words[0];
            args = [...words.slice(1), ...stage.args];
          }
        }
        // Filename globbing (after alias expansion, like a real shell):
        // `*.md`, `src/*.ts` expand against the VFS. Quoted wildcards were
        // shielded by the tokenizer, so they pass through literal here.
        name = unescapeWild(name);
        args = expandArgs(args, this.cwd, globFs);
        const command = this.registry.get(name);
        if (!command) {
          this.print(`unknown command: ${name}. type 'help'.`, "error");
          return false;
        }
        const isLast = i === stages.length - 1;
        // Capture output for every stage but the last, and for the last stage
        // when its output is being redirected to a file.
        const capture = !isLast || redirect !== null ? [] : undefined;
        await command.run(args, this.context({ stdin: input, capture, status }));
        input = capture ? capture.join("\n") : "";
      }

      if (redirect) {
        const path = this.vfs.resolve(this.cwd, unescapeWild(redirect.file));
        const prefix =
          redirect.append && this.vfs.getNode(path)
            ? this.vfs.readFile(path) + "\n"
            : "";
        this.vfs.writeFile(path, prefix + input);
        await this.adapter.save(this.vfs.root);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.print(`error: ${message}`, "error");
      return false;
    }
    return !status.failed;
  }

  /**
   * Build the context handed to a command for one invocation. The engine builds
   * the {@link CoreCommandContext}; an app's `extendContext` (if any) adds its
   * own fields to produce the full `Ctx`. Called once per command, so `cwd` is a
   * fresh snapshot — no command reads it after `setCwd` within the same run.
   */
  private context(
    opts: { stdin?: string; capture?: string[]; status?: { failed: boolean } } = {},
  ): Ctx {
    const capture = opts.capture;
    // Route stderr and internal refusals through one place so they both print
    // and mark the pipeline failed (so `&&`/`||` can branch on it).
    const fail = (text: string): void => {
      if (opts.status) opts.status.failed = true;
      this.print(text, "error");
    };
    const core: CoreCommandContext = {
      vfs: this.vfs,
      session: this.session,
      registry: this.registry,
      stdin: opts.stdin ?? "",
      piped: capture !== undefined,
      cwd: this.cwd,
      setCwd: (path: string) => {
        this.cwd = path;
      },
      // Captured stages collect stdout into a buffer; otherwise it hits the DOM.
      print: capture
        ? (text = "") => capture.push(text)
        : (text, cls) => this.print(text, cls),
      // stderr always goes to the screen, never into the pipe.
      error: (text) => fail(text),
      clear: () => this.clear(),
      persist: () => this.adapter.save(this.vfs.root),
      reloadFs: async () => {
        const root = await this.adapter.load();
        if (root) this.vfs.root = root;
      },
      applyConfig: () => this.loadConfig(),
      pickFile: () => this.pickFile(),
      saveFile: (name, content) => this.saveFile(name, content),
      history: () => [...this.history],
      clearHistory: () => {
        this.history.length = 0;
        this.historyIndex = 0;
      },
      runApp: capture
        ? () => {
            fail("cannot run a full-screen app in a pipeline");
            return Promise.resolve();
          }
        : (factory) => this.runApp(factory),
    };
    return this.extendContext ? this.extendContext(core) : (core as Ctx);
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
        this.renderKeybar();
        this.focusKbd();
        resolve();
      };
      const app = factory(exit);
      this.activeApp = app;
      this.outputEl.style.display = "none";
      this.setInputVisible(false);
      this.appEl.style.display = "";
      app.mount(this.appEl);
      this.renderKeybar();
      this.focusKbd();
    });
  }

  // ---- on-screen key bar ----------------------------------------------------

  /** Keys shown at the prompt: the ones a phone keyboard hides or lacks. */
  private promptKeys(): KeySpec[] {
    const insert = (ch: string): KeySpec => ({
      label: ch,
      subtle: true,
      run: () => this.insertText(ch),
    });
    return [
      { label: "Tab", run: () => this.onTab() },
      { label: "↑", run: () => this.recallHistory(-1) },
      { label: "↓", run: () => this.recallHistory(1) },
      { label: "←", run: () => this.moveCursor(-1) },
      { label: "→", run: () => this.cursorRight() },
      { label: "paste", subtle: true, activate: "click", run: () => void this.pasteFromClipboard() },
      insert("|"),
      insert(">"),
      insert("~"),
      insert("/"),
      insert("-"),
      { label: "^C", run: () => this.cancelLine() },
      { label: "^L", run: () => this.clear() },
    ];
  }

  private moveCursor(delta: -1 | 1): void {
    const next = this.cursor + delta;
    if (next < 0 || next > this.buffer.length) return;
    this.cursor = next;
    this.renderInput();
  }

  private cancelLine(): void {
    this.print(`${this.promptText()} ${this.buffer}^C`, "dim");
    this.resetLine();
  }

  /** Redraw the key bar for the current context (active app, else the prompt). */
  private renderKeybar(): void {
    const keys = this.activeApp ? this.activeApp.keys?.() : this.promptKeys();
    this.keybarEl.replaceChildren();
    if (!keys || keys.length === 0) {
      this.keybarEl.style.display = "none";
      return;
    }
    this.keybarEl.style.display = "";
    for (const key of keys) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = key.subtle ? "kb-key subtle" : "kb-key";
      btn.textContent = key.label;
      if (key.activate === "click") {
        // A real click carries the user activation the Clipboard API needs on
        // iOS; the keyboard may close, so restore focus afterwards.
        btn.addEventListener("click", () => {
          key.run();
          if (this.activeApp) this.renderKeybar();
        });
      } else {
        // pointerdown + preventDefault keeps the hidden input focused, so the
        // soft keyboard never closes when a bar key is tapped.
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          key.run();
          if (this.activeApp) this.renderKeybar(); // reflect an app key/mode change
        });
      }
      this.keybarEl.append(btn);
    }
  }
}
