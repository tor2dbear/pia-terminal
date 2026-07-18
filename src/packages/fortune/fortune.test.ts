import { describe, expect, it } from "vitest";
import { FORTUNES, pickFortune } from "./fortune.js";

describe("pickFortune", () => {
  it("returns the first fortune at rng 0", () => {
    expect(pickFortune(() => 0)).toBe(FORTUNES[0]);
  });

  it("returns the last fortune just under 1", () => {
    expect(pickFortune(() => 0.999999)).toBe(FORTUNES[FORTUNES.length - 1]);
  });

  it("only ever returns a known fortune", () => {
    for (let i = 0; i < FORTUNES.length; i++) {
      const r = i / FORTUNES.length;
      expect(FORTUNES).toContain(pickFortune(() => r));
    }
  });
});
