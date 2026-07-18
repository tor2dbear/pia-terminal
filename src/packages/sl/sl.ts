import type { ScreenApp } from "../../terminal/screen.js";

/**
 * `sl` — Steam Locomotive. The train you get for fat-fingering `ls`. A little
 * loco chuffs across the screen from right to left and then the app exits. The
 * frame rendering is a pure function so it's testable; the screen app just
 * drives an offset down a timer.
 */

// The locomotive body (fixed) plus two alternating wheel rows, so the drivers
// appear to turn as it rolls.
const BODY: string[] = [
  "      ====        ________                ___________",
  "  _D _|  |_______/        \\__I_I_____===__|_________|",
  "   |(_)---  |   H\\________/ |   |        =|___ ___|",
  "   /     |  |   H  |  |     |   |         ||_| |_||",
  "  |      |  |   H  |__--------------------| [___] |",
  "  | ________|___H__/__|_____/[][]~\\_______|       |",
  "  |/ |   |-----------I_____I [][] []  D   |=======|__",
];

const WHEELS: [string, string] = [
  "__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__",
  "__/ =| o |=-~O=====O=====O=====O_/____Y___________|__",
];

/** The train as an array of lines for a given wheel phase (0 or 1). */
export function trainLines(phase: number): string[] {
  return [...BODY, WHEELS[phase & 1]];
}

/** Widest train line — how far the train must travel to fully clear the left. */
export function trainWidth(): number {
  return Math.max(...trainLines(0).map((l) => l.length));
}

/**
 * Render one frame: the train's left edge at column `offset` on a `cols`-wide
 * field. `phase` picks the wheel row. Returns one string per train row.
 */
export function renderFrame(offset: number, cols: number, phase = 0): string[] {
  return trainLines(phase).map((line) => {
    let row = "";
    for (let c = 0; c < cols; c++) {
      const idx = c - offset;
      row += idx >= 0 && idx < line.length ? line[idx] : " ";
    }
    return row.replace(/\s+$/, "");
  });
}

const COLS = 78;
const TICK_MS = 60;

export class SteamLoco implements ScreenApp {
  private offset: number;
  private phase = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private boardEl: HTMLPreElement | undefined;

  constructor(private readonly exit: () => void) {
    // Start just off the right edge.
    this.offset = COLS;
  }

  mount(container: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "sl";
    this.boardEl = document.createElement("pre");
    this.boardEl.className = "sl-board";
    wrap.append(this.boardEl);
    container.append(wrap);
    this.render();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  unmount(): void {
    this.stop();
  }

  private stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  // Real `sl` ignores interrupts — that's the joke — so we swallow keys and let
  // the train finish. ^X still bails, so nobody's actually trapped.
  onKey(e: KeyboardEvent): void {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.exit();
    }
  }

  onText(): void {
    // Ignored — you asked for a train, you get a train.
  }

  /** Advance one column. Public so tests can drive it deterministically. */
  tick(): void {
    this.offset--;
    this.phase ^= 1;
    if (this.offset <= -trainWidth()) {
      this.stop();
      this.exit();
      return;
    }
    this.render();
  }

  snapshot(): { offset: number; done: boolean } {
    return { offset: this.offset, done: this.offset <= -trainWidth() };
  }

  private render(): void {
    if (!this.boardEl) return;
    this.boardEl.textContent = renderFrame(this.offset, COLS, this.phase).join("\n");
  }
}
