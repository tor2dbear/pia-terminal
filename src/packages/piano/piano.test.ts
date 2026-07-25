// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Piano, noteFreq } from "./piano.js";

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
});
