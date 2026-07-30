import type { Terminal } from "./terminal.js";
import type { TabControl, TabInfo } from "./tabcontrol.js";

/**
 * A tiny terminal multiplexer — tmux-lite. One machine (a shared VFS and
 * account), several *windows*: each is its own {@link Terminal} instance with an
 * independent cwd, history, scrollback and running app, mounted in its own pane.
 *
 * The core terminal is already per-instance (own input field, own scroll
 * container, a `dispose()`), so this is just the shell around it: a window strip,
 * pane show/hide, focus routing, and tmux-style prefix keys (Ctrl-B then
 * c/n/p/x/1-9). Input routes naturally — only the visible pane's field is
 * focusable, so keystrokes always reach the active window.
 *
 * Deliberately *windows only* — no panes/splits (a separate layout problem) and
 * no layout persistence yet. The visible strip is a GUI/emulator concession (an
 * accepted web divergence, like the on-screen key bar); the prefix keys are the
 * Unix idiom.
 */

const PREFIX_KEY = "b"; // Ctrl-B, tmux's default (unbound in PIA's readline)
const MAX_WINDOWS = 9; // the 1-9 quick-select range

interface Win {
  pane: HTMLElement;
  term: Terminal;
}

export class TabManager implements TabControl {
  private readonly wins: Win[] = [];
  private active = 0;
  private readonly stripEl: HTMLElement;
  private readonly panesEl: HTMLElement;
  private prefixArmed = false;

  constructor(
    private readonly root: HTMLElement,
    /** Build a Terminal into the given pane (with the shared services wired). */
    private readonly spawn: (pane: HTMLElement) => Terminal,
  ) {
    this.stripEl = document.createElement("div");
    this.stripEl.className = "term-tabs";
    this.panesEl = document.createElement("div");
    this.panesEl.className = "term-panes";
    this.root.append(this.stripEl, this.panesEl);
    // Capture phase: intercept the prefix (and its follow-up key) before the
    // focused terminal's own handler sees it.
    this.root.addEventListener("keydown", this.onKeyDown, true);
    this.renderStrip();
  }

  /** Open the first (or another) window and return its terminal. */
  open(): Terminal {
    if (this.wins.length >= MAX_WINDOWS) {
      this.activate(this.active);
      return this.wins[this.active].term;
    }
    const pane = document.createElement("div");
    pane.className = "term-pane";
    this.panesEl.append(pane);
    const term = this.spawn(pane);
    this.wins.push({ pane, term });
    this.activate(this.wins.length - 1);
    return term;
  }

  /** The currently focused window's terminal. */
  current(): Terminal | undefined {
    return this.wins[this.active]?.term;
  }

  // ---- TabControl (also driven by the `tmux` command) ----------------------

  newWindow(): void {
    this.open();
  }

  next(): void {
    if (this.wins.length > 1) this.activate((this.active + 1) % this.wins.length);
  }

  prev(): void {
    if (this.wins.length > 1) {
      this.activate((this.active - 1 + this.wins.length) % this.wins.length);
    }
  }

  select(index: number): void {
    const i = index - 1;
    if (i >= 0 && i < this.wins.length) this.activate(i);
  }

  kill(): void {
    this.close(this.active);
  }

  list(): TabInfo[] {
    return this.wins.map((w, i) => ({
      index: i + 1,
      active: i === this.active,
      title: w.term.title(),
    }));
  }

  // ---- internals -----------------------------------------------------------

  private close(i: number): void {
    if (this.wins.length <= 1 || i < 0 || i >= this.wins.length) return; // keep the last
    const [w] = this.wins.splice(i, 1);
    w.term.dispose();
    w.pane.remove();
    if (this.active >= this.wins.length) this.active = this.wins.length - 1;
    this.activate(this.active);
  }

  private activate(i: number): void {
    this.active = i;
    this.wins.forEach((w, idx) => {
      w.pane.style.display = idx === i ? "" : "none";
    });
    this.renderStrip();
    this.wins[i]?.term.focus();
  }

  /** The strip shows only with more than one window — no chrome by default. */
  private renderStrip(): void {
    this.root.classList.toggle("has-tabs", this.wins.length > 1);
    this.stripEl.replaceChildren();
    this.wins.forEach((w, i) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = i === this.active ? "term-tab active" : "term-tab";
      tab.append(document.createTextNode(`${i + 1}:${w.term.title()}`));
      tab.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.activate(i);
      });
      if (this.wins.length > 1) {
        const close = document.createElement("span");
        close.className = "term-tab-x";
        close.textContent = "×";
        close.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.close(i);
        });
        tab.append(close);
      }
      this.stripEl.append(tab);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "term-tab-add";
    add.textContent = "+";
    add.title = "new window (Ctrl-B c)";
    add.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.newWindow();
    });
    this.stripEl.append(add);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.prefixArmed) {
      this.prefixArmed = false;
      const k = e.key.toLowerCase();
      let handled = true;
      if (k === "c") this.newWindow();
      else if (k === "n") this.next();
      else if (k === "p") this.prev();
      else if (k === "x" || k === "&") this.kill();
      else if (/^[1-9]$/.test(k)) this.select(Number(k));
      else handled = false; // not a window command — let it fall through
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === PREFIX_KEY) {
      this.prefixArmed = true;
      e.preventDefault();
      e.stopPropagation();
    }
  };
}
