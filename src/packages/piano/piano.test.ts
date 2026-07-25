// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Piano, noteFreq } from "./piano.js";

/** A stand-in AudioContext that starts suspended (like iOS/Safari) and only
 *  becomes "running" when a pending resume() is flushed. Records the context
 *  state at each createOscillator, so a note scheduled while suspended is
 *  visible (that's the bug — such a note is dropped by real browsers). */
class FakeAudioContext {
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  destination = {};
  startedAt: string[] = [];
  private pending: Array<() => void> = [];
  resume(): Promise<void> {
    return new Promise((resolve) => {
      this.pending.push(() => {
        this.state = "running";
        resolve();
      });
    });
  }
  flushResume(): void {
    const p = this.pending;
    this.pending = [];
    for (const f of p) f();
  }
  createOscillator() {
    this.startedAt.push(this.state);
    return {
      type: "",
      frequency: { value: 0 },
      connect() {
        return this;
      },
      start() {},
      stop() {},
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {
        return this;
      },
    };
  }
  close() {}
}

describe("noteFreq", () => {
  it("anchors A4 at 440 Hz and middle C near 261.63", () => {
    expect(noteFreq("A4")).toBeCloseTo(440, 5);
    expect(noteFreq("C4")).toBeCloseTo(261.63, 1);
  });

  it("is a semitone ratio apart and an octave doubles", () => {
    expect(noteFreq("A#4") / noteFreq("A4")).toBeCloseTo(2 ** (1 / 12), 5);
    expect(noteFreq("C5") / noteFreq("C4")).toBeCloseTo(2, 5);
  });

  it("returns 0 for a bad note", () => {
    expect(noteFreq("H9")).toBe(0);
  });
});

describe("Piano app", () => {
  const mount = () => {
    const root = document.createElement("div");
    let exited = false;
    const app = new Piano(() => (exited = true));
    app.mount(root);
    return { app, root, exited: () => exited };
  };

  it("draws white and black keys", () => {
    const { root } = mount();
    expect(root.querySelectorAll(".pn-white").length).toBe(8);
    expect(root.querySelectorAll(".pn-black").length).toBe(5);
  });

  it("shifts the octave within bounds and plays without a Web Audio backend", () => {
    const { app } = mount();
    app.onText("x"); // +1
    expect(app.snapshot().octave).toBe(1);
    app.onText("zzzzz"); // clamp at -2
    expect(app.snapshot().octave).toBe(-2);
    // Striking notes must not throw when AudioContext is absent (jsdom).
    expect(() => app.onText("asdfghjk")).not.toThrow();
  });

  it("exits on q or Escape", () => {
    const { app, exited } = mount();
    app.onText("q");
    expect(exited()).toBe(true);
  });

  it("reports the audio state in the status once a key is struck", () => {
    const { root } = mount(); // jsdom → no Web Audio backend
    const status = () => root.querySelector(".pn-status")?.textContent ?? "";
    expect(status()).not.toContain("sound:"); // nothing struck yet
    // With no AudioContext available, a struck key honestly reads "no audio".
    (root.querySelector(".pn-white") as HTMLElement).dispatchEvent(
      new Event("pointerdown", { bubbles: true }),
    );
    expect(status()).toContain("sound: no audio");
  });

  it("resumes a suspended context before scheduling a note (iOS/Safari)", async () => {
    const fake = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => fake),
    );
    const { app } = mount();

    app.onText("a"); // strike while suspended
    // The note must NOT be scheduled yet — a tone on a suspended context is
    // dropped (the "no sound" bug). It waits for resume.
    expect(fake.startedAt).toEqual([]);

    fake.flushResume(); // context becomes running
    await Promise.resolve(); // let the resume().then(...) run
    expect(fake.startedAt).toEqual(["running"]); // scheduled only once running

    app.onText("s"); // already running → immediate
    expect(fake.startedAt).toEqual(["running", "running"]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
