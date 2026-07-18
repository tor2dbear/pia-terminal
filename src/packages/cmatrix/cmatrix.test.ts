import { describe, expect, it } from "vitest";
import { MatrixRain } from "./cmatrix.js";

// A tiny LCG so the rng is deterministic and repeatable across ticks.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("MatrixRain", () => {
  it("starts empty (all spaces)", () => {
    const rain = new MatrixRain(10, 6, lcg(1));
    expect(rain.render().join("")).toBe("");
    expect(rain.snapshot().active).toBe(0);
  });

  it("eventually spawns drops and advances their heads", () => {
    const rain = new MatrixRain(20, 10, lcg(42));
    for (let i = 0; i < 30; i++) rain.tick();
    const snap = rain.snapshot();
    // Some heads have advanced (a drop has been active for a while).
    expect(Math.max(...snap.heads)).toBeGreaterThan(0);
  });

  it("paints visible glyphs once running", () => {
    const rain = new MatrixRain(20, 10, lcg(7));
    for (let i = 0; i < 40; i++) rain.tick();
    const glyphs = rain.render().join("").replace(/ /g, "");
    expect(glyphs.length).toBeGreaterThan(0);
  });

  it("is deterministic for a fixed seed", () => {
    const a = new MatrixRain(15, 8, lcg(123));
    const b = new MatrixRain(15, 8, lcg(123));
    for (let i = 0; i < 25; i++) {
      a.tick();
      b.tick();
    }
    expect(a.render()).toEqual(b.render());
  });
});
