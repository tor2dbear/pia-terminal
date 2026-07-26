import { describe, expect, it } from "vitest";
import { Minesweeper } from "./minesweeper.js";

/** A deterministic rng cycling through the given values. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function countMines(game: Minesweeper): number {
  let n = 0;
  for (const row of game.cells) for (const cell of row) if (cell.mine) n++;
  return n;
}

describe("minesweeper", () => {
  it("lays exactly `mines` mines on the first reveal", () => {
    const game = new Minesweeper(5, 5, 5, seq([0.1, 0.9, 0.3, 0.7, 0.5]));
    expect(countMines(game)).toBe(0); // none placed until the first reveal
    game.reveal(2, 2);
    expect(countMines(game)).toBe(5);
  });

  it("never places a mine under the first-revealed cell or its neighbours", () => {
    const game = new Minesweeper(5, 5, 20, Math.random); // dense board
    game.reveal(2, 2);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        expect(game.cells[2 + dr][2 + dc].mine).toBe(false);
      }
    }
  });

  it("the first reveal is always safe (never an immediate loss)", () => {
    // A dense 6×6/30 board leaves only a handful of safe cells, so the first
    // click can legitimately flood-fill all of them and *win* — that's still
    // safe. The invariant under test is only that it never *loses*, so assert
    // that (not `=== "playing"`, which randomly reddened CI on an auto-win).
    // Run many fresh layouts so a broken first-click guard can't slip through a
    // lucky seed.
    for (let i = 0; i < 50; i++) {
      const game = new Minesweeper(6, 6, 30, Math.random);
      game.reveal(0, 0);
      expect(game.state).not.toBe("lost");
    }
  });

  it("flood-fills an empty region on a zero-adjacent reveal", () => {
    // A single mine in the corner leaves a large open region to flood from afar.
    const game = new Minesweeper(5, 5, 1, seq([0]));
    game.reveal(4, 4); // opposite corner from where the mine lands
    const revealed = game.cells.flat().filter((c) => c.revealed).length;
    expect(revealed).toBeGreaterThan(1); // more than just the clicked cell
  });

  it("reveals a mine → lost, and exposes every mine", () => {
    // Deterministic seed (CLAUDE.md's rule): with Math.random the safe first
    // click could flood-fill every non-mine cell and *win*, making the later
    // mine-reveal a no-op and reddening CI at random. This layout leaves cells
    // hidden after the first click (guarded below), so there's a mine to step on.
    const game = new Minesweeper(4, 4, 3, seq([0.025]));
    game.reveal(0, 0); // safe first click, places mines
    expect(game.state).toBe("playing"); // guard: no accidental auto-win
    const mine = game.cells.flat().find((c) => c.mine)!;
    const [mr, mc] = findCell(game, mine);
    game.reveal(mr, mc);
    expect(game.state).toBe("lost");
    expect(game.cells.flat().every((c) => !c.mine || c.revealed)).toBe(true);
  });

  it("revealing every safe cell wins", () => {
    const game = new Minesweeper(3, 3, 1, seq([0])); // one mine
    game.reveal(0, 0); // safe first click places the mine
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) if (!game.cells[r][c].mine) game.reveal(r, c);
    }
    expect(game.state).toBe("won");
  });

  it("counts only the mines that fit, so the counter is right after a clipped win", () => {
    // 5×5 = 25 cells; a centre first click reserves 9, leaving 16 — fewer than
    // the 20 requested. Every remaining cell is a mine, so the click wins at
    // once and flags all 16. minesLeft must be 16-16 = 0, not 20-16 = 4.
    const game = new Minesweeper(5, 5, 20, Math.random);
    game.reveal(2, 2);
    expect(game.state).toBe("won");
    expect(countMines(game)).toBe(16);
    expect(game.minesLeft).toBe(0);
  });

  it("flags decrement the mines-left counter and block reveals", () => {
    const game = new Minesweeper(4, 4, 4, Math.random);
    game.reveal(0, 0);
    expect(game.minesLeft).toBe(4);
    game.toggleFlag(3, 3);
    expect(game.minesLeft).toBe(3);
    game.reveal(3, 3); // flagged → ignored
    expect(game.cells[3][3].revealed).toBe(false);
    game.toggleFlag(3, 3); // unflag
    expect(game.minesLeft).toBe(4);
  });
});

/** Locate a cell object's coordinates within the grid. */
function findCell(game: Minesweeper, target: unknown): [number, number] {
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) if (game.cells[r][c] === target) return [r, c];
  }
  throw new Error("cell not found");
}
