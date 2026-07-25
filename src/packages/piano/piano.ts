import type { ScreenApp, KeySpec } from "../../terminal/screen.js";

/**
 * A little synth piano — PIA's first sound. One octave mapped to the computer
 * keyboard (a s d f g h j k = white keys, w e t y u = the black keys), or tap
 * the on-screen keys on a phone. `z`/`x` shift the octave. Notes are triangle
 * waves with a short pluck envelope via the Web Audio API — all client-side, no
 * network, so it stays within the strict CSP. The AudioContext is created on the
 * first note (a real user gesture, as browsers require) and absent in jsdom, so
 * the app degrades to silent-but-visual under test.
 */

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Equal-temperament frequency of a note like `C4`, `F#4` (A4 = 440 Hz). */
export function noteFreq(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return 0;
  const semitone = SEMITONE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const midi = semitone + (Number(m[3]) + 1) * 12; // C4 → 60
  return 440 * 2 ** ((midi - 69) / 12);
}

type Key = { k: string; note: string };
const WHITE: Key[] = [
  { k: "a", note: "C4" }, { k: "s", note: "D4" }, { k: "d", note: "E4" },
  { k: "f", note: "F4" }, { k: "g", note: "G4" }, { k: "h", note: "A4" },
  { k: "j", note: "B4" }, { k: "k", note: "C5" },
];
// `after` = index of the white key each black key sits just past.
const BLACK: (Key & { after: number })[] = [
  { k: "w", note: "C#4", after: 0 }, { k: "e", note: "D#4", after: 1 },
  { k: "t", note: "F#4", after: 3 }, { k: "y", note: "G#4", after: 4 },
  { k: "u", note: "A#4", after: 5 },
];
const BY_KEY = new Map<string, Key>([...WHITE, ...BLACK].map((k) => [k.k, k]));

type AudioCtor = typeof AudioContext;

export class Piano implements ScreenApp {
  private octave = 0; // shift in octaves, via z/x
  private struck = false; // a key has been played (so the status can report audio)
  private ctx?: AudioContext;
  private rootEl?: HTMLElement;
  private statusEl?: HTMLElement;
  private readonly keyEls = new Map<string, HTMLElement>();

  constructor(private readonly exit: () => void) {}

  mount(container: HTMLElement): void {
    this.rootEl = document.createElement("div");
    this.rootEl.className = "pn";
    this.rootEl.append(this.buildTitle(), this.buildKeyboard(), this.buildStatus());
    container.append(this.rootEl);
  }

  unmount(): void {
    void this.ctx?.close();
  }

  keys(): KeySpec[] {
    return [
      { label: "8ve-", run: () => this.shift(-1) },
      { label: "8ve+", run: () => this.shift(1) },
      { label: "q", run: () => this.exit() },
    ];
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === "Escape" || (e.ctrlKey && (e.key === "x" || e.key === "X"))) {
      e.preventDefault();
      this.exit();
    }
  }

  onText(text: string): void {
    for (const ch of text) {
      const c = ch.toLowerCase();
      if (c === "q") return this.exit();
      if (c === "z") this.shift(-1);
      else if (c === "x") this.shift(1);
      else if (BY_KEY.has(c)) this.strike(c);
    }
  }

  /** Test view — no audio needed. */
  snapshot(): { octave: number; keys: number } {
    return { octave: this.octave, keys: this.keyEls.size };
  }

  // ---- sound ----------------------------------------------------------------

  private strike(k: string): void {
    const key = BY_KEY.get(k);
    if (!key) return;
    this.struck = true;
    this.play(noteFreq(key.note) * 2 ** this.octave);
    this.flashKey(k);
    this.renderStatus(); // reflect the audio state (running / suspended / no audio)
  }

  private play(freq: number): void {
    if (freq <= 0) return;
    const ctx = this.ensureCtx();
    if (!ctx) return; // no Web Audio (e.g. jsdom) — stay visual
    // A note scheduled on a *suspended* context is silently dropped — and iOS /
    // Safari create the context suspended even inside a user gesture, which is
    // exactly "no sound". So resume first and only schedule the tone once the
    // clock is actually running; when it's already running, play immediately.
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => {
        this.tone(ctx, freq);
        this.renderStatus(); // flip the status to "running" once actually resumed
      });
      return;
    }
    this.tone(ctx, freq);
  }

  /** Schedule one plucked note on a running context. */
  private tone(ctx: AudioContext, freq: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  private ensureCtx(): AudioContext | undefined {
    if (this.ctx) return this.ctx;
    // iOS silences Web Audio under the Ring/Silent switch because the default
    // session is "ambient". Opt into "playback" so a tapped key sounds even in
    // silent mode and at full volume (Safari 16.4+; absent/no-op elsewhere).
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {
        /* not settable on this engine — ignore */
      }
    }
    const Ctor: AudioCtor | undefined =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (globalThis as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (Ctor) this.ctx = new Ctor();
    return this.ctx;
  }

  // ---- rendering ------------------------------------------------------------

  private buildTitle(): HTMLElement {
    const el = document.createElement("div");
    el.className = "pn-title";
    el.textContent = "  PIANO";
    return el;
  }

  private buildKeyboard(): HTMLElement {
    const board = document.createElement("div");
    board.className = "pn-board";

    const whites = document.createElement("div");
    whites.className = "pn-whites";
    for (const key of WHITE) whites.append(this.buildKey(key, "pn-white"));
    board.append(whites);

    for (const key of BLACK) {
      const el = this.buildKey(key, "pn-black");
      // Sit each black key over the seam after its white key (CSSOM left is
      // CSP-safe — same as the theme code).
      el.style.left = `${((key.after + 1) * 100) / WHITE.length}%`;
      board.append(el);
    }
    return board;
  }

  private buildKey(key: Key, cls: string): HTMLElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = cls;
    el.textContent = key.k.toUpperCase();
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.strike(key.k);
    });
    this.keyEls.set(key.k, el);
    return el;
  }

  private buildStatus(): HTMLElement {
    this.statusEl = document.createElement("div");
    this.statusEl.className = "pn-status";
    this.renderStatus();
    return this.statusEl;
  }

  private renderStatus(): void {
    if (!this.statusEl) return;
    const sign = this.octave > 0 ? `+${this.octave}` : `${this.octave}`;
    // When sound is playing, stay out of the way. Only speak up if a struck key
    // couldn't make sound, so silence is at least explained: the context hasn't
    // unlocked yet (tap again) or there's no Web Audio here at all.
    let sound = "";
    if (this.ctx && this.ctx.state !== "running") sound = " · tap again for sound";
    else if (!this.ctx && this.struck) sound = " · no audio on this browser";
    this.statusEl.textContent = `octave ${sign} · z/x to shift · a s d f… to play${sound}`;
  }

  private shift(by: number): void {
    this.octave = Math.max(-2, Math.min(2, this.octave + by));
    this.renderStatus();
  }

  private flashKey(k: string): void {
    const el = this.keyEls.get(k);
    if (!el) return;
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 160);
  }
}
