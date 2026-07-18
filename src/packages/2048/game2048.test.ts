import { describe, expect, it } from "vitest";
import { Game2048 } from "./game2048.js";

// rng() === 0 → spawn always lands a 2 in the first empty cell: deterministic.
const make = () => new Game2048(() => {}, () => 0);

describe("Game2048", () => {
  it("starts with two 2s", () => {
    const snap = make().snapshot();
    expect(snap.grid[0]).toEqual([2, 2, 0, 0]);
    expect(snap.score).toBe(0);
  });

  it("slides and merges, scoring the merge, then spawns", () => {
    const g = make();
    g.setGrid([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(g.move("left")).toBe(true);
    const snap = g.snapshot();
    expect(snap.grid[0]).toEqual([4, 2, 0, 0]); // merged 4, then a spawned 2
    expect(snap.score).toBe(4);
  });

  it("treats a no-op move as no move (no spawn)", () => {
    const g = make();
    g.setGrid([
      [4, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(g.move("left")).toBe(false);
    expect(g.snapshot().grid[0]).toEqual([4, 2, 0, 0]); // untouched
  });

  it("wins when a 2048 tile appears", () => {
    const g = make();
    g.setGrid([
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    g.move("left");
    expect(g.snapshot().won).toBe(true);
  });

  it("slides up correctly", () => {
    const g = make();
    g.setGrid([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    g.move("up");
    expect(g.snapshot().grid[0][0]).toBe(4);
  });
});
