import { describe, expect, it } from "vitest";
import { Life } from "./life.js";

/** Place live cells at the given coordinates on a fresh grid. */
function seed(w: number, h: number, cells: [number, number][]): Life {
  const life = new Life(w, h);
  for (const [x, y] of cells) life.set(x, y, true);
  return life;
}

describe("Life", () => {
  it("keeps a block (still life) stable", () => {
    const life = seed(6, 6, [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ]);
    life.step();
    expect(life.get(2, 2) && life.get(3, 2) && life.get(2, 3) && life.get(3, 3)).toBe(true);
    expect(life.population()).toBe(4);
  });

  it("oscillates a blinker with period 2", () => {
    // Vertical bar of three.
    const life = seed(5, 5, [
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
    life.step();
    // Now horizontal.
    expect([life.get(1, 2), life.get(2, 2), life.get(3, 2)]).toEqual([true, true, true]);
    expect(life.get(2, 1)).toBe(false);
    life.step();
    // Back to vertical.
    expect([life.get(2, 1), life.get(2, 2), life.get(2, 3)]).toEqual([true, true, true]);
  });

  it("lets a lone cell die and empty space stay empty", () => {
    const life = seed(4, 4, [[1, 1]]);
    life.step();
    expect(life.population()).toBe(0);
  });

  it("randomize is deterministic for a fixed rng and respects density 0/1", () => {
    const all = new Life(5, 5);
    all.randomize(() => 0, 1); // every rng()<1 → alive
    expect(all.population()).toBe(25);
    const none = new Life(5, 5);
    none.randomize(() => 0.9, 0.5); // every rng()<0.5 false → dead
    expect(none.population()).toBe(0);
  });
});
