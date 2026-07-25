import type { ScreenApp, KeySpec } from "../../terminal/screen.js";
import { WORDS, isWord } from "./words.js";

/**
 * Wordle: guess the hidden five-letter word in six tries. Each guess colours its
 * letters — correct (right letter, right spot), present (in the word, wrong
 * spot), or absent. A full-screen {@link ScreenApp}; the letters come from the
 * device keyboard (`onText`), Enter submits, Backspace deletes. The answer is
 * drawn with an injectable rng so the game is deterministic in tests.
 */

export type Mark = "correct" | "present" | "absent";
const LEN = 5;
const TRIES = 6;

/**
 * Score a guess against the answer with Wordle's two-pass duplicate handling:
 * exact matches first, then remaining letters are "present" only while unused
 * copies remain in the answer.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from({ length: LEN }, () => "absent");
  const rest: Record<string, number> = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) marks[i] = "correct";
    else rest[answer[i]] = (rest[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (marks[i] === "correct") continue;
    const c = guess[i];
    if ((rest[c] ?? 0) > 0) {
      marks[i] = "present";
      rest[c]--;
    }
  }
  return marks;
}

type Row = { text: string; marks: Mark[] };

export class Wordle implements ScreenApp {
  private readonly answer: string;
  private rows: Row[] = []; // submitted guesses
  private current = ""; // the row being typed
  private done = false;
  private won = false;
  private message = "";
  /** Best mark seen per letter, for the on-screen keyboard hint. */
  private readonly keyState = new Map<string, Mark>();

  private rootEl?: HTMLElement;

  constructor(
    private readonly exit: () => void,
    rng: () => number = Math.random,
  ) {
    this.answer = WORDS[Math.floor(rng() * WORDS.length)];
  }

  mount(container: HTMLElement): void {
    this.rootEl = document.createElement("div");
    this.rootEl.className = "wd";
    container.append(this.rootEl);
    this.render();
  }

  unmount(): void {
    /* nothing to clean up */
  }

  keys(): KeySpec[] {
    return [
      { label: "⏎", run: () => this.submit() },
      { label: "⌫", run: () => this.backspace() },
      { label: "q", run: () => this.exit() },
    ];
  }

  onKey(e: KeyboardEvent): void {
    // q is a letter here (queen, quick…), so quit is Esc / ^X / the key-bar button.
    if (e.key === "Escape" || (e.ctrlKey && (e.key === "x" || e.key === "X"))) {
      e.preventDefault();
      return this.exit();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      return this.submit();
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      return this.backspace();
    }
  }

  onText(text: string): void {
    for (const ch of text) {
      if (this.done && ch.toLowerCase() === "q") return this.exit();
      if (/[a-z]/i.test(ch)) this.type(ch.toLowerCase());
    }
  }

  /** Test view of the model. */
  snapshot(): { answer: string; guesses: string[]; done: boolean; won: boolean } {
    return { answer: this.answer, guesses: this.rows.map((r) => r.text), done: this.done, won: this.won };
  }

  // ---- game -----------------------------------------------------------------

  private type(ch: string): void {
    if (this.done) return;
    if (this.current.length >= LEN) return;
    this.current += ch;
    this.message = "";
    this.render();
  }

  private backspace(): void {
    if (this.done || this.current.length === 0) return;
    this.current = this.current.slice(0, -1);
    this.render();
  }

  submit(): void {
    if (this.done) {
      // A finished board: Enter starts a fresh game.
      return this.exit();
    }
    if (this.current.length < LEN) {
      this.flash("not enough letters");
      return;
    }
    if (!isWord(this.current)) {
      this.flash("not in word list");
      return;
    }
    const marks = scoreGuess(this.current, this.answer);
    this.rows.push({ text: this.current, marks });
    for (let i = 0; i < LEN; i++) this.raiseKey(this.current[i], marks[i]);
    if (this.current === this.answer) {
      this.done = true;
      this.won = true;
      this.message = "splendid! (q to exit)";
    } else if (this.rows.length >= TRIES) {
      this.done = true;
      this.message = `the word was ${this.answer.toUpperCase()} (q to exit)`;
    }
    this.current = "";
    this.render();
  }

  /** Keep only the strongest mark ever seen for a key (correct > present > absent). */
  private raiseKey(ch: string, mark: Mark): void {
    const rank = { absent: 0, present: 1, correct: 2 };
    const prev = this.keyState.get(ch);
    if (!prev || rank[mark] > rank[prev]) this.keyState.set(ch, mark);
  }

  private flash(msg: string): void {
    this.message = msg;
    this.render();
  }

  // ---- rendering ------------------------------------------------------------

  private render(): void {
    if (!this.rootEl) return;
    this.rootEl.replaceChildren();

    const title = document.createElement("div");
    title.className = "wd-title";
    title.textContent = "  WORDLE";
    this.rootEl.append(title);

    const grid = document.createElement("div");
    grid.className = "wd-grid";
    for (let r = 0; r < TRIES; r++) {
      const row = document.createElement("div");
      row.className = "wd-row";
      const submitted = this.rows[r];
      const typing = !submitted && r === this.rows.length ? this.current : "";
      for (let c = 0; c < LEN; c++) {
        const tile = document.createElement("div");
        tile.className = "wd-tile";
        if (submitted) {
          tile.classList.add(submitted.marks[c]);
          tile.textContent = submitted.text[c].toUpperCase();
        } else if (typing[c]) {
          tile.classList.add("filled");
          tile.textContent = typing[c].toUpperCase();
        }
        row.append(tile);
      }
      grid.append(row);
    }
    this.rootEl.append(grid);

    const status = document.createElement("div");
    status.className = "wd-status";
    status.textContent = this.message || "guess the word — type, ⏎ to submit";
    this.rootEl.append(status);

    this.rootEl.append(this.buildKeyboard());
  }

  private buildKeyboard(): HTMLElement {
    const kb = document.createElement("div");
    kb.className = "wd-keys";
    for (const rowChars of ["qwertyuiop", "asdfghjkl", "zxcvbnm"]) {
      const row = document.createElement("div");
      row.className = "wd-krow";
      for (const ch of rowChars) {
        const key = document.createElement("span");
        key.className = "wd-key";
        const mark = this.keyState.get(ch);
        if (mark) key.classList.add(mark);
        key.textContent = ch.toUpperCase();
        row.append(key);
      }
      kb.append(row);
    }
    return kb;
  }
}
