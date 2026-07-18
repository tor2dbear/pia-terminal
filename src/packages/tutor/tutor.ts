import type { KeySpec, ScreenApp } from "../../terminal/screen.js";
import { TutorSession } from "./session.js";

export { TutorSession };

/**
 * `tutor` — an interactive terminal course. It shows an instruction, you type a
 * command at its prompt, and it checks the *form* of what you typed against the
 * lesson (teaching real syntax that transfers to any shell). Progression lives
 * in {@link TutorSession}; this class is just the screen and the line editor.
 */
export class Tutor implements ScreenApp {
  private readonly session = new TutorSession();
  private buffer = "";
  private feedback = "";
  private feedbackKind: "ok" | "hint" | "" = "";

  private titleEl: HTMLDivElement | undefined;
  private bodyEl: HTMLDivElement | undefined;
  private feedbackEl: HTMLDivElement | undefined;
  private promptEl: HTMLDivElement | undefined;

  constructor(private readonly exit: () => void) {}

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "tutor";
    this.titleEl = document.createElement("div");
    this.titleEl.className = "tutor-title";
    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "tutor-body";
    this.feedbackEl = document.createElement("div");
    this.feedbackEl.className = "tutor-feedback";
    this.promptEl = document.createElement("div");
    this.promptEl.className = "tutor-prompt";
    wrap.append(this.titleEl, this.bodyEl, this.feedbackEl, this.promptEl);
    container.append(wrap);
    this.render();
  }

  unmount(): void {
    // Nothing to tear down — no timers.
  }

  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      this.submit();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      this.buffer = this.buffer.slice(0, -1);
      this.render();
    }
  }

  onText(text: string): void {
    // Ignore control chars; take the printable rest.
    this.buffer += text.replace(/[\r\n]/g, "");
    this.render();
  }

  keys(): KeySpec[] {
    return [
      { label: "enter", run: () => this.submit() },
      { label: "quit", run: () => this.exit() },
    ];
  }

  private submit(): void {
    if (this.session.isComplete()) {
      this.exit();
      return;
    }
    const line = this.buffer;
    if (line.trim() === "") return;
    const result = this.session.submit(line);
    if (result.correct) {
      this.feedback = `✓ ${result.explain ?? "correct"}`;
      this.feedbackKind = "ok";
      this.buffer = "";
    } else {
      this.feedback = `not quite — try: ${result.solution ?? ""}`;
      this.feedbackKind = "hint";
    }
    this.render();
  }

  private render(): void {
    if (!this.titleEl || !this.bodyEl || !this.feedbackEl || !this.promptEl) return;

    if (this.session.isComplete()) {
      const { total } = this.session.position();
      this.titleEl.textContent = "tutor · complete";
      this.bodyEl.textContent = `You cleared all ${total} lessons. That syntax works in any real shell too. Press ^X to leave.`;
      this.feedbackEl.textContent = this.feedback;
      this.feedbackEl.className = "tutor-feedback ok";
      this.promptEl.textContent = "";
      return;
    }

    const lesson = this.session.current();
    const { n, total } = this.session.position();
    this.titleEl.textContent = `tutor · lesson ${n}/${total} · ${lesson?.title ?? ""}`;
    this.bodyEl.textContent = lesson?.instruction ?? "";
    this.feedbackEl.textContent = this.feedback;
    this.feedbackEl.className = `tutor-feedback ${this.feedbackKind}`;
    this.promptEl.textContent = `learn@pia:~$ ${this.buffer}█`;
  }
}
