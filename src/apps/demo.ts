import { neofetch } from "../commands/system.js";
import type { CommandContext, LineClass } from "../commands/registry.js";
import type { ScreenApp, KeySpec } from "../terminal/screen.js";

/**
 * `demo` — a self-running tour of PIA that loops, for screen recordings. It's a
 * full-screen {@link ScreenApp} that replays a scripted reel: it types each
 * command character by character (blinking block cursor, with a human-ish
 * rhythm), prints the output, pauses to read, then types `clear` to wipe the
 * screen between scenes — and starts over. Any key exits.
 *
 * The reel is *scripted*, not live: deterministic timing, no Pyodide load, no
 * filesystem side effects — so a recording is identical every take and stitches
 * into a seamless loop (the last frame equals the first). It stays faithful to
 * the real thing: the neofetch scene is captured from the real command, the
 * figlet banner is checked against the real figlet in the test, and the
 * full-screen scenes reuse the actual editor (`ed-*`), checklist (`td-*`) and
 * Python REPL (`pyrepl-*`) chrome, so a viewer can't tell them from a live one.
 *
 * It's one coherent session — every command really works, in order, from a
 * fresh *guest* home — so a viewer who retypes it gets the same result: the file
 * `publish` counts is the one the session just wrote in `nano`, and optional
 * packages (`python`, `figlet`, `cowsay`) are `brew install`ed before use.
 * (Cloud-only flows like `remind` / `todo share` are deliberately left out — a
 * guest can't run them, and the reel must never show a command that would fail.)
 */

/** A line of scripted scrollback output. `cls` omitted means normal. */
type OutLine = { text: string; cls?: Exclude<LineClass, "normal"> };

/** One `>>>` interaction in the Python REPL scene. */
type ReplEntry = { input: string; out?: string[] };

/** One reel step. `cmd` types a shell line; the rest are full-screen apps. */
type Step =
  | { kind: "cmd"; text: string; prompt?: string; out?: OutLine[] }
  | { kind: "clear" }
  | { kind: "nano"; file: string; lines: string[] }
  | { kind: "todo"; file: string; add: string[]; check?: number }
  | { kind: "repl"; banner: string; entries: ReplEntry[] };

/** A single rendered moment of a full-screen scene, and how long to hold it. */
type Frame = { render: (stage: HTMLElement) => void; delay: number };

const PROMPT = "guest@pia:~$";
const IN_NOTES = "guest@pia:~/notes$"; // prompt while cwd is ~/notes

/** Pacing, in milliseconds. Tuned to feel like a brisk, confident operator. */
const TIMING = {
  type: 45, // baseline per character while typing (~22 cps)
  think: 320, // after a line is fully typed, before it "runs"
  line: 55, // between successive output lines
  read: 1400, // after output, before the next command
  clearPause: 550, // hold an empty screen at a scene break
  loop: 850, // extra beat before the reel restarts
  open: 480, // beat as a full-screen app takes over
  hold: 1150, // hold a finished app state (e.g. "saved") before leaving
} as const;

/**
 * The delay before the *next* keystroke, given how much has been typed. A real
 * typist isn't a metronome: they pause a touch longer after a word (space) and
 * after punctuation, and every key lands a few ms off the beat. Derived purely
 * from the text (character codes), never a RNG, so every recording is identical.
 */
function typeDelay(text: string, typed: number): number {
  const prev = text[typed - 1] ?? "";
  let d = TIMING.type;
  if (prev === " ") d += 90; // gather for the next word
  else if (`.,:;/-"'`.includes(prev)) d += 55; // beat after punctuation
  // Deterministic ±jitter from the upcoming character, so the cadence breathes.
  const jitter = ((text.charCodeAt(typed) || 0) % 5) * 6 - 12;
  return Math.max(20, d + jitter);
}

/** Run a pure-print command into a buffer, so its scene stays truthful. */
function capture(
  run: (args: string[], ctx: CommandContext) => void,
  args: string[],
): OutLine[] {
  const out: OutLine[] = [];
  const ctx = {
    session: { user: "guest" },
    print: (text = "", cls: LineClass = "normal") =>
      out.push(cls === "normal" ? { text } : { text, cls: cls as OutLine["cls"] }),
  } as unknown as CommandContext;
  run(args, ctx);
  return out;
}

/** A speech bubble + cow, exactly as `cowsay` draws it (kept in sync by test). */
function cowsay(text: string): OutLine[] {
  const line = ` ${text} `;
  return [
    ` ${"_".repeat(line.length)}`,
    `<${line}>`,
    ` ${"-".repeat(line.length)}`,
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
  ].map((t) => ({ text: t }));
}

// `figlet PIA`, mirrored from the real figlet package (a `src/packages` chunk we
// don't want to pull into the demo bundle). The test asserts this equals the
// live figlet("PIA"), so it can't drift.
const FIGLET_PIA: OutLine[] = [
  "###  ###  ## ",
  "#  #  #  #  #",
  "###   #  ####",
  "#     #  #  #",
  "#    ### #  #",
].map((text) => ({ text }));

// ---- full-screen scene rendering (reuses the real apps' chrome) ------------

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Draw the nano editor exactly as the real editor does: title / body / status. */
function renderEditor(
  stage: HTMLElement,
  file: string,
  bodyLines: string[],
  dirty: boolean,
  msg: string,
): void {
  const title = el("div", "ed-title", `  PIA editor · ${file}${dirty ? " *" : ""}`);
  const body = el("div", "ed-body");
  bodyLines.forEach((text, i) => {
    // A zero-width space keeps a blank line from collapsing.
    const line = el("div", "ed-line", text === "" ? "​" : text);
    if (i === bodyLines.length - 1) line.append(el("span", "term-cursor", " "));
    body.append(line);
  });
  const status = el("div", "ed-status");
  status.append(el("span", "ed-hint", "^O save · ^X exit"), el("span", "ed-msg", msg), el("span", "ed-pos", ""));
  stage.replaceChildren(title, body, status);
}

/** Frames that type `lines` into a fresh nano buffer, then `^O` save it. */
function nanoFrames(file: string, lines: string[], instant: boolean): Frame[] {
  const frames: Frame[] = [];
  const push = (bodyLines: string[], dirty: boolean, msg: string, delay: number) =>
    frames.push({ render: (s) => renderEditor(s, file, bodyLines, dirty, msg), delay });

  if (instant) {
    push(lines, false, `saved ${file}`, TIMING.hold);
    return frames;
  }
  push([""], false, "", TIMING.open); // open empty
  const acc: string[] = [];
  for (const full of lines) {
    acc.push("");
    for (let ci = 1; ci <= full.length; ci++) {
      acc[acc.length - 1] = full.slice(0, ci);
      push([...acc], true, "", TIMING.type);
    }
  }
  push([...lines], true, "", TIMING.read); // sit on the finished buffer
  push([...lines], false, `saved ${file}`, TIMING.hold); // ^O
  return frames;
}

type TodoItem = { text: string; done: boolean };

/** Draw the checklist exactly as the real todo app does: title / body / status. */
function renderTodo(
  stage: HTMLElement,
  file: string,
  items: TodoItem[],
  mode: "list" | "add",
  draft: string,
): void {
  const title = el("div", "td-title", `  todo · ${file}`);
  const body = el("div", "td-body");
  if (items.length === 0 && mode !== "add") {
    body.append(el("div", "td-empty", "empty — press + to add an item"));
  }
  items.forEach((item) => {
    const row = el("div", "td-row");
    row.append(
      el("span", item.done ? "td-check done" : "td-check", item.done ? "[x] " : "[ ] "),
      el("span", item.done ? "td-text done" : "td-text", item.text),
    );
    body.append(row);
  });
  if (mode === "add") {
    const add = el("div", "td-add", `+ ${draft}`);
    add.append(el("span", "td-cursor", " "));
    body.append(add);
  }
  const open = items.filter((i) => !i.done).length;
  const done = items.length - open;
  const status = el(
    "div",
    "td-status",
    mode === "add"
      ? "type an item · Enter to add · esc to cancel · ^X exit"
      : `${open} open · ${done} done   space toggle · + add · ⌫ del · ^X exit`,
  );
  stage.replaceChildren(title, body, status);
}

/** Frames that add each item (typed at the `+` prompt), then tick one off. */
function todoFrames(file: string, add: string[], check: number | undefined, instant: boolean): Frame[] {
  const frames: Frame[] = [];
  const items: TodoItem[] = [];
  const push = (mode: "list" | "add", draft: string, delay: number) => {
    const snapshot = items.map((i) => ({ ...i }));
    frames.push({ render: (s) => renderTodo(s, file, snapshot, mode, draft), delay });
  };

  if (instant) {
    for (const text of add) items.push({ text, done: false });
    if (check !== undefined && items[check]) items[check].done = true;
    push("list", "", TIMING.hold);
    return frames;
  }

  push("list", "", TIMING.open); // opens empty
  for (const text of add) {
    push("add", "", TIMING.think); // enter add mode
    for (let ci = 1; ci <= text.length; ci++) push("add", text.slice(0, ci), TIMING.type);
    items.push({ text, done: false }); // Enter — the row lands, ready for the next
    push("add", "", TIMING.read);
  }
  push("list", "", TIMING.read); // esc back to the list
  if (check !== undefined && items[check]) {
    items[check].done = true; // space toggles it
    push("list", "", TIMING.hold);
  } else {
    push("list", "", TIMING.hold);
  }
  return frames;
}

/** Draw the Python REPL exactly as the real one does: an <pre> log + a prompt. */
function renderRepl(stage: HTMLElement, outLines: string[], promptLine: string): void {
  const wrap = el("div", "pyrepl");
  const out = el("pre", "pyrepl-out", outLines.join("\n"));
  const prompt = el("div", "pyrepl-prompt", promptLine);
  wrap.append(out, prompt);
  stage.replaceChildren(wrap);
}

/** Frames that run each entry at the `>>>` prompt, then type `exit()`. */
function replFrames(banner: string, entries: ReplEntry[], instant: boolean): Frame[] {
  const frames: Frame[] = [];
  const out = [banner];
  const push = (promptLine: string, delay: number) => {
    const snapshot = [...out];
    frames.push({ render: (s) => renderRepl(s, snapshot, promptLine), delay });
  };

  if (instant) {
    for (const e of entries) out.push(`>>> ${e.input}`, ...(e.out ?? []));
    push(">>> exit()█", TIMING.hold);
    return frames;
  }
  push(">>> █", TIMING.open);
  for (const e of entries) {
    for (let ci = 1; ci <= e.input.length; ci++) push(`>>> ${e.input.slice(0, ci)}█`, TIMING.type);
    out.push(`>>> ${e.input}`, ...(e.out ?? [])); // "enter"
    push(">>> █", TIMING.read);
  }
  const exitCmd = "exit()";
  for (let ci = 1; ci <= exitCmd.length; ci++) push(`>>> ${exitCmd.slice(0, ci)}█`, TIMING.type);
  push(`>>> ${exitCmd}█`, TIMING.hold);
  return frames;
}

const clear: Step = { kind: "clear" };

/** The reel: what a first-time visitor should see PIA do, in ~90 seconds. */
export const REEL: Step[] = [
  // 1 — identity.
  { kind: "cmd", text: "neofetch", out: capture(neofetch.run, []) },
  clear,

  // 2 — a real filesystem, and Markdown written in the editor then rendered.
  // The prompt tracks the working directory, like the real shell.
  { kind: "cmd", text: "ls", out: [{ text: "welcome.txt" }] },
  { kind: "cmd", text: "mkdir notes && cd notes" },
  { kind: "cmd", prompt: IN_NOTES, text: "nano notes.md" },
  {
    kind: "nano",
    file: "notes.md",
    lines: ["# PIA", "a little computer in the browser.", "- files, folders, and real Python"],
  },
  {
    kind: "cmd",
    prompt: IN_NOTES,
    text: "glow notes.md",
    out: [
      { text: "PIA", cls: "accent" },
      { text: "───", cls: "dim" },
      { text: "a little computer in the browser." },
      { text: "• files, folders, and real Python" },
    ],
  },
  clear,

  // 3 — it's a *real* shell: search and find over the files just made.
  { kind: "cmd", prompt: IN_NOTES, text: "cd ~" },
  {
    kind: "cmd",
    text: "grep -in pia welcome.txt",
    out: [{ text: "5:new here? try `demo`, `tutor`, or `man pia`." }],
  },
  {
    kind: "cmd",
    text: 'find . -name "*.md"',
    out: [{ text: "./notes/notes.md" }],
  },
  clear,

  // 4 — a checklist, in its own full-screen app (shareable to collaborate).
  { kind: "cmd", text: "todo groceries" },
  { kind: "todo", file: "groceries", add: ["buy milk", "call the plumber", "book flights"], check: 0 },
  clear,

  // 5 — sharing is a link, not a server. `notes/` holds exactly one file.
  {
    kind: "cmd",
    text: "publish notes",
    out: [
      { text: "https://pia.tor2dbear.com/#p=eyJ2IjoxLCJ…", cls: "accent" },
      { text: "(1 file — open the link to receive them)", cls: "dim" },
    ],
  },
  clear,

  // 6 — packages: install one and use it. Big ASCII type, client-side.
  {
    kind: "cmd",
    text: "brew install figlet",
    out: [{ text: "installed figlet — commands: figlet", cls: "accent" }],
  },
  { kind: "cmd", text: "figlet PIA", out: FIGLET_PIA },
  clear,

  // 7 — the climax: install and run real CPython, in its own REPL.
  {
    kind: "cmd",
    text: "brew install python",
    out: [{ text: "installed python — commands: python", cls: "accent" }],
  },
  { kind: "cmd", text: "python" },
  {
    kind: "repl",
    banner: "Python (Pyodide) — type exit() or press ^X to quit.",
    entries: [
      { input: "2 ** 64", out: ["18446744073709551616"] },
      { input: "sum(range(1, 101))", out: ["5050"] },
    ],
  },
  clear,

  // 8 — a wink, and back to the top.
  {
    kind: "cmd",
    text: "brew install cowsay",
    out: [{ text: "installed cowsay — commands: cowsay, cowthink", cls: "accent" }],
  },
  {
    kind: "cmd",
    text: 'cowsay "a little computer in the browser"',
    out: cowsay("a little computer in the browser"),
  },
  clear,
];

type Phase = "start" | "typing" | "run" | "output" | "frames" | "read" | "next";

export class DemoReel implements ScreenApp {
  private stepIdx = 0;
  private phase: Phase = "start";
  private charIdx = 0;
  private outIdx = 0;
  private lineCount = 0; // logical scrollback size, for tests

  // The command currently being "typed" — its text, its output, and whether
  // finishing it should wipe the screen (that's how a `clear` step is played:
  // as a real, typed `clear` command rather than an instant blank).
  private cmdText = "";
  private cmdOut: OutLine[] = [];
  private clearAfter = false;
  private lastPrompt = PROMPT; // prompt of the last command line (for `clear`)

  private frames: Frame[] = [];
  private frameIdx = 0;

  private container?: HTMLElement;
  private screenEl?: HTMLDivElement;
  private stageEl?: HTMLDivElement;
  private typedEl?: Text;
  private cursorEl?: HTMLSpanElement;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private readonly instant: boolean;

  constructor(private readonly exit: () => void) {
    this.instant =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  mount(container: HTMLElement): void {
    // Reuse the terminal's own output styling so the reel is indistinguishable
    // from a live session (and re-tints with the active theme).
    this.container = container;
    this.screenEl = document.createElement("div");
    // `.demo-screen` bounds and scrolls this surface within `.term-app` — the
    // live terminal leans on the `#screen` root to scroll, which this app
    // doesn't own, so it must be its own scroll container (see style.css).
    this.screenEl.className = "term-output demo-screen";
    container.append(this.screenEl);
    this.stopped = false;
    this.timer = setTimeout(this.loop, TIMING.think);
  }

  unmount(): void {
    this.stop();
  }

  keys(): KeySpec[] {
    return [{ label: "q exit", run: () => this.quit() }];
  }

  onKey(e: KeyboardEvent): void {
    // Any key exits, as advertised — but ignore a lone modifier press, so
    // reaching for a chord (Shift+…, Ctrl+…) doesn't count as "a key".
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
    e.preventDefault();
    this.quit();
  }

  onText(_text: string): void {
    // Any printable key exits too.
    this.quit();
  }

  /** Model snapshot for tests — no DOM needed. */
  snapshot(): { stepIdx: number; phase: Phase; lines: number } {
    return { stepIdx: this.stepIdx, phase: this.phase, lines: this.lineCount };
  }

  // ---- playback ------------------------------------------------------------

  private loop = (): void => {
    if (this.stopped) return;
    const delay = this.tick();
    this.timer = setTimeout(this.loop, Math.max(0, delay));
  };

  /** Advance one atomic step; returns the delay (ms) until the next tick. */
  tick(): number {
    const step = REEL[this.stepIdx];

    if (this.phase === "start") return this.beginStep(step);

    if (this.phase === "typing") {
      this.charIdx++;
      this.renderTyped(this.cmdText.slice(0, this.charIdx));
      if (this.charIdx >= this.cmdText.length) {
        this.phase = "run";
        return TIMING.think;
      }
      return typeDelay(this.cmdText, this.charIdx);
    }

    if (this.phase === "run") {
      this.removeCursor();
      this.outIdx = 0;
      this.phase = "output";
      return 0;
    }

    if (this.phase === "output") {
      const out = this.cmdOut;
      if (this.outIdx >= out.length) {
        // A `clear` command finishes by wiping the screen; a normal command
        // just sits on its output before the next step.
        if (this.clearAfter) {
          this.clearScreen();
          this.phase = "next";
          return TIMING.clearPause;
        }
        this.phase = "read";
        return out.length ? 0 : TIMING.think;
      }
      this.printLine(out[this.outIdx++]);
      return this.outIdx >= out.length ? TIMING.read : TIMING.line;
    }

    if (this.phase === "frames") {
      if (this.frameIdx >= this.frames.length) {
        this.exitStage();
        this.phase = "read";
        return TIMING.clearPause;
      }
      const frame = this.frames[this.frameIdx++];
      if (this.stageEl) frame.render(this.stageEl);
      return frame.delay;
    }

    // "read" or "next": move to the next step (looping at the end).
    return this.advanceStep();
  }

  private beginStep(step: Step): number {
    if (step.kind === "clear") {
      // Play `clear` as a real command: type it at the prompt, then wipe.
      this.beginCmdLine(this.lastPrompt);
      return this.beginCmd("clear", [], true);
    }
    if (step.kind === "nano" || step.kind === "todo" || step.kind === "repl") {
      this.enterStage();
      this.frames =
        step.kind === "nano"
          ? nanoFrames(step.file, step.lines, this.instant)
          : step.kind === "todo"
            ? todoFrames(step.file, step.add, step.check, this.instant)
            : replFrames(step.banner, step.entries, this.instant);
      this.phase = "frames";
      // Render the first frame now, so the take-over shows real app chrome from
      // the opening beat instead of an empty stage flashing for TIMING.open.
      const first = this.frames[0];
      this.frameIdx = 1;
      if (this.stageEl && first) first.render(this.stageEl);
      return first ? first.delay : 0;
    }
    // cmd
    this.beginCmdLine(step.prompt ?? PROMPT);
    return this.beginCmd(step.text, step.out ?? [], false);
  }

  /** Arm the typing machinery for a command line (shared by `cmd` and `clear`). */
  private beginCmd(text: string, out: OutLine[], clearAfter: boolean): number {
    this.cmdText = text;
    this.cmdOut = out;
    this.clearAfter = clearAfter;
    this.charIdx = 0;
    if (this.instant) {
      this.renderTyped(text);
      this.phase = "run";
      return TIMING.think;
    }
    this.phase = "typing";
    return typeDelay(text, 0);
  }

  private advanceStep(): number {
    const wrapped = this.stepIdx + 1 >= REEL.length;
    this.stepIdx = wrapped ? 0 : this.stepIdx + 1;
    this.phase = "start";
    return wrapped ? TIMING.loop : 0;
  }

  // ---- rendering (all no-ops until mounted) --------------------------------

  private beginCmdLine(prompt: string): void {
    this.lastPrompt = prompt;
    this.lineCount++;
    if (!this.screenEl) return;
    const line = document.createElement("div");
    line.className = "term-line";
    const promptEl = document.createElement("span");
    promptEl.className = "term-echo-prompt";
    promptEl.textContent = prompt;
    this.typedEl = document.createTextNode(" ");
    this.cursorEl = document.createElement("span");
    this.cursorEl.className = "term-cursor";
    this.cursorEl.textContent = " ";
    line.append(promptEl, this.typedEl, this.cursorEl);
    this.screenEl.append(line);
    this.scroll();
  }

  private renderTyped(text: string): void {
    if (this.typedEl) this.typedEl.textContent = ` ${text}`;
    this.scroll();
  }

  private removeCursor(): void {
    this.cursorEl?.remove();
    this.cursorEl = undefined;
  }

  private printLine(out: OutLine): void {
    this.lineCount++;
    if (!this.screenEl) return;
    const line = document.createElement("div");
    line.className = out.cls ? `term-line ${out.cls}` : "term-line";
    line.textContent = out.text === "" ? "​" : out.text;
    this.screenEl.append(line);
    this.scroll();
  }

  private clearScreen(): void {
    this.lineCount = 0;
    this.removeCursor();
    this.typedEl = undefined;
    this.screenEl?.replaceChildren();
  }

  /** A full-screen app takes over: hide the scrollback, mount a fresh stage. */
  private enterStage(): void {
    if (!this.container || !this.screenEl) return;
    this.screenEl.style.display = "none";
    this.stageEl = document.createElement("div");
    this.stageEl.className = "demo-stage";
    this.container.append(this.stageEl);
  }

  /** The app exits: drop the stage, restore the scrollback underneath it. */
  private exitStage(): void {
    this.stageEl?.remove();
    this.stageEl = undefined;
    if (this.screenEl) {
      this.screenEl.style.display = "";
      this.scroll();
    }
  }

  private scroll(): void {
    if (this.screenEl) this.screenEl.scrollTop = this.screenEl.scrollHeight;
  }

  // ---- lifecycle -----------------------------------------------------------

  private stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private quit(): void {
    this.stop();
    this.exit();
  }
}
