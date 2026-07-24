import { neofetch } from "../commands/system.js";
import type { CommandContext, LineClass } from "../commands/registry.js";
import type { ScreenApp, KeySpec } from "../terminal/screen.js";

/**
 * `demo` — a self-running tour of PIA that loops, for screen recordings. It's a
 * full-screen {@link ScreenApp} that replays a scripted reel: it types each
 * command character by character (blinking block cursor), prints the output,
 * pauses to read, and `clear`s between scenes — then starts over. Any key exits.
 *
 * The reel is *scripted*, not live: deterministic timing, no Pyodide load, no
 * filesystem side effects — so a recording is identical every take and stitches
 * into a seamless loop (the last frame equals the first). The output is kept
 * faithful to the real commands: the neofetch scene is captured from the real
 * `neofetch`, and the rest mirrors each command's actual formatting.
 *
 * Interactive take-overs (`nano`, `todo`, the games) aren't in the reel — they
 * own the screen themselves and are best recorded live; the reel tells the
 * story that scrollback can show.
 */

/** A line of scripted output. `cls` omitted means normal (foreground). */
type OutLine = { text: string; cls?: Exclude<LineClass, "normal"> };

/** One reel step: a typed command with its output, or a scene break. */
type Step =
  | { kind: "cmd"; text: string; prompt?: string; out?: OutLine[] }
  | { kind: "clear" };

const PROMPT = "guest@pia:~$";
const PY = ">>>";

/** Pacing, in milliseconds. Tuned to feel like a brisk, confident operator. */
const TIMING = {
  type: 45, // per character while typing a command (~22 cps)
  think: 320, // after a command is fully typed, before it "runs"
  line: 55, // between successive output lines
  read: 1500, // after a command's output, before the next command
  clearPause: 550, // hold an empty screen at a scene break
  loop: 850, // extra beat before the reel restarts
} as const;

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

const clear: Step = { kind: "clear" };

/** The reel: what a first-time visitor should see PIA do, in ~40 seconds. */
export const REEL: Step[] = [
  // 1 — identity.
  { kind: "cmd", text: "neofetch", out: capture(neofetch.run, []) },
  clear,

  // 2 — a real filesystem you can shape.
  { kind: "cmd", text: "ls", out: [{ text: "welcome.txt" }] },
  { kind: "cmd", text: "mkdir notes && cd notes" },
  { kind: "cmd", text: 'echo "a little computer in the browser" > pia.txt' },
  {
    kind: "cmd",
    text: "cd ~ && tree",
    out: [
      { text: "guest/" },
      { text: "├─ notes/" },
      { text: "│  └─ pia.txt" },
      { text: "└─ welcome.txt" },
    ],
  },
  clear,

  // 3 — Markdown, raw then rendered.
  {
    kind: "cmd",
    text: "cat notes.md",
    out: [
      { text: "# PIA" },
      { text: "a little computer in the browser." },
      { text: "" },
      { text: "- files, folders, a real editor" },
      { text: "- shared checklists" },
      { text: "- even real Python" },
      { text: "" },
      { text: "> named after Pia — a backronym, like Lisa." },
    ],
  },
  {
    kind: "cmd",
    text: "glow notes.md",
    out: [
      { text: "PIA", cls: "accent" },
      { text: "───", cls: "dim" },
      { text: "a little computer in the browser." },
      { text: "" },
      { text: "• files, folders, a real editor" },
      { text: "• shared checklists" },
      { text: "• even real Python" },
      { text: "" },
      { text: "│ named after Pia — a backronym, like Lisa.", cls: "dim" },
    ],
  },
  clear,

  // 4 — sharing is a link, not a server.
  {
    kind: "cmd",
    text: "publish notes",
    out: [
      { text: "https://pia.tor2dbear.com/#p=eyJ2IjoxLCJ…", cls: "accent" },
      { text: "(2 files — open the link to receive them)", cls: "dim" },
    ],
  },
  clear,

  // 5 — the climax: real CPython in the browser.
  {
    kind: "cmd",
    text: "python",
    out: [{ text: "Python (Pyodide) — type exit() or press ^X to quit.", cls: "dim" }],
  },
  { kind: "cmd", text: "2 ** 64", prompt: PY, out: [{ text: "18446744073709551616" }] },
  { kind: "cmd", text: "sum(range(1, 101))", prompt: PY, out: [{ text: "5050" }] },
  { kind: "cmd", text: "exit()", prompt: PY },
  clear,

  // 6 — a wink, and back to the top.
  {
    kind: "cmd",
    text: 'cowsay "a little computer in the browser"',
    out: cowsay("a little computer in the browser"),
  },
  clear,
];

type Phase = "start" | "typing" | "run" | "output" | "read" | "next";

export class DemoReel implements ScreenApp {
  private stepIdx = 0;
  private phase: Phase = "start";
  private charIdx = 0;
  private outIdx = 0;
  private lineCount = 0; // logical scrollback size, for tests

  private screenEl?: HTMLDivElement;
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

    if (this.phase === "start") {
      if (step.kind === "clear") {
        this.clearScreen();
        this.phase = "next";
        return TIMING.clearPause;
      }
      this.beginCmdLine(step.prompt ?? PROMPT);
      this.charIdx = 0;
      if (this.instant) {
        this.renderTyped(step.text);
        this.phase = "run";
        return TIMING.think;
      }
      this.phase = "typing";
      return TIMING.type;
    }

    if (this.phase === "typing" && step.kind === "cmd") {
      this.charIdx++;
      this.renderTyped(step.text.slice(0, this.charIdx));
      if (this.charIdx >= step.text.length) {
        this.phase = "run";
        return TIMING.think;
      }
      return TIMING.type;
    }

    if (this.phase === "run") {
      this.removeCursor();
      this.outIdx = 0;
      this.phase = "output";
      return 0;
    }

    if (this.phase === "output" && step.kind === "cmd") {
      const out = step.out ?? [];
      if (this.outIdx >= out.length) {
        this.phase = "read";
        return out.length ? 0 : TIMING.think;
      }
      this.printLine(out[this.outIdx++]);
      return this.outIdx >= out.length ? TIMING.read : TIMING.line;
    }

    // "read" or "next": move to the next step (looping at the end).
    return this.advanceStep();
  }

  private advanceStep(): number {
    const wrapped = this.stepIdx + 1 >= REEL.length;
    this.stepIdx = wrapped ? 0 : this.stepIdx + 1;
    this.phase = "start";
    return wrapped ? TIMING.loop : 0;
  }

  // ---- rendering (all no-ops until mounted) --------------------------------

  private beginCmdLine(prompt: string): void {
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
    // A zero-width space keeps a blank line from collapsing to nothing.
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
