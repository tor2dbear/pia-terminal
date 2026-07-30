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
  private ready = false; // gates *new* windows until the first one finishes booting
  private transitions = 0; // >0 while an account change is in flight (login/logout)

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
    // Keep this window's tab label in step with its cwd (only the active
    // window's cwd change need repaint the strip).
    term.setTitleListener(() => {
      if (this.wins[this.active]?.term === term) this.renderStrip();
    });
    this.wins.push({ pane, term });
    this.activate(this.wins.length - 1);
    return term;
  }

  /** The currently focused window's terminal. */
  current(): Terminal | undefined {
    return this.wins[this.active]?.term;
  }

  /** Allow opening further windows — called once the first window has booted and
   * post-boot setup (packages, account, shares) is done. */
  markReady(): void {
    this.ready = true;
  }

  // ---- TabControl (also driven by the `tmux` command) ----------------------

  newWindow(): void {
    if (!this.ready) return; // don't spawn windows mid-boot (shared setup incomplete)
    this.open();
  }

  otherWindowsBusy(): boolean {
    return this.wins.some((w, i) => i !== this.active && w.term.isBusy());
  }

  beginTransition(): void {
    this.transitions++;
  }

  endTransition(): void {
    this.transitions = Math.max(0, this.transitions - 1);
  }

  /** True while an account change is in flight — the terminal's lock predicate. */
  inTransition(): boolean {
    return this.transitions > 0;
  }

  /** A window free to run a scheduled job (prefer the active one), or undefined
   * if every window is busy. */
  idleWindow(): Terminal | undefined {
    const active = this.wins[this.active];
    if (active?.term.isIdle()) return active.term;
    return this.wins.find((w) => w.term.isIdle())?.term;
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
    // `tmux kill` runs *in* the window it closes, so that window is "busy" with
    // the kill command itself — force past the running-command guard (there's
    // nothing else to lose; you can't type it while another command runs).
    this.close(this.active, true);
  }

  list(): TabInfo[] {
    return this.wins.map((w, i) => ({
      index: i + 1,
      active: i === this.active,
      title: w.term.title(),
    }));
  }

  // ---- internals -----------------------------------------------------------

  private close(i: number, force = false): void {
    if (this.wins.length <= 1 || i < 0 || i >= this.wins.length) return; // keep the last
    // Don't close a window mid-command — abort is cooperative, so its side
    // effects (e.g. a login's account switch) would complete unseen. An open
    // full-screen app is fine to close out of (dispose unmounts it). `force`
    // skips this for `tmux kill`, whose own command is the only thing running.
    if (!force && this.wins[i].term.isRunningCommand()) return;
    const [w] = this.wins.splice(i, 1);
    w.term.dispose(); // stops the window's running command / app too
    w.pane.remove();
    // Keep the same window selected when a *preceding* one is removed; clamp when
    // the active (or a following) window shifted off the end.
    if (i < this.active) this.active--;
    else if (this.active >= this.wins.length) this.active = this.wins.length - 1;
    this.activate(this.active);
  }

  /**
   * Re-home every window onto the current account. All windows share one session
   * and VFS, but login/logout/usermod only re-home the window that ran them —
   * this catches the rest up (cwd → new home, config reloaded). Wired from
   * main.ts via the Terminal's onAccountChange.
   */
  rehomeAll(): void {
    for (const w of this.wins) w.term.rehome();
    this.renderStrip();
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
      // A tab and its close control are sibling <button>s in a wrapper (not
      // nested — that's invalid HTML), both keyboard-operable via `click`, which
      // Enter/Space on a focused button also fire.
      const item = document.createElement("div");
      item.className = i === this.active ? "term-tab-item active" : "term-tab-item";
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "term-tab";
      tab.setAttribute("aria-label", `window ${i + 1}: ${w.term.title()}`);
      tab.setAttribute("aria-current", i === this.active ? "true" : "false");
      tab.textContent = `${i + 1}:${w.term.title()}`;
      tab.addEventListener("click", () => this.activate(i));
      item.append(tab);
      if (this.wins.length > 1) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "term-tab-x";
        close.textContent = "×";
        close.setAttribute("aria-label", `close window ${i + 1}`);
        close.addEventListener("click", () => this.close(i));
        item.append(close);
      }
      this.stripEl.append(item);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "term-tab-add";
    add.textContent = "+";
    add.title = "new window (Ctrl-B c)";
    add.setAttribute("aria-label", "new window");
    add.addEventListener("click", () => this.newWindow());
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
      else if (k === "x" || k === "&") this.close(this.active); // guarded (unlike `tmux kill`)
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
