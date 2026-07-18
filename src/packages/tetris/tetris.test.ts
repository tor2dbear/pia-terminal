import { describe, expect, it } from "vitest";
import { Tetris, WIDTH, HEIGHT } from "./tetris.js";

describe("Tetris", () => {
  it("spawns a piece and reports a next piece", () => {
    const game = new Tetris(() => 0);
    const snap = game.snapshot();
    expect(snap.over).toBe(false);
    expect(snap.cells.length).toBe(HEIGHT);
    expect(snap.cells[0].length).toBe(WIDTH);
    // Some cell is filled by the active piece.
    expect(snap.cells.flat().some((c) => c !== 0)).toBe(true);
    expect(["I", "O", "T", "S", "Z", "J", "L"]).toContain(snap.next);
  });

  it("clears a full row and scores it", () => {
    const game = new Tetris(() => 0);
    // Fill the bottom row except the last two columns, then drop an O into them.
    const board = Array.from({ length: HEIGHT }, () => Array<number>(WIDTH).fill(0));
    for (let x = 0; x < WIDTH - 2; x++) board[HEIGHT - 1][x] = 1;
    // Row above needs the same two columns filled so the O clears exactly one row.
    for (let x = 0; x < WIDTH - 2; x++) board[HEIGHT - 2][x] = 1;
    game.setBoard(board);
    game.setCurrent("O", WIDTH - 2, 0);
    game.dropAndLock();
    // The bottom two rows were completed by the O and cleared.
    expect(game.lines).toBe(2);
    expect(game.score).toBeGreaterThan(0);
    // The two filled rows were the only locked content, so all that's left is
    // the freshly spawned piece — exactly four cells.
    expect(game.snapshot().cells.flat().filter((c) => c !== 0).length).toBe(4);
  });

  it("moves and rotates within the well", () => {
    const game = new Tetris(() => 0);
    game.setCurrent("T", 4, 5, 0);
    const before = game.snapshot().cells.flat().filter((c) => c !== 0).length;
    expect(game.move(-1, 0)).toBe(true);
    expect(game.rotate()).toBe(true);
    // Still four filled cells for the piece (plus none locked).
    const after = game.snapshot().cells.flat().filter((c) => c !== 0).length;
    expect(after).toBe(before);
  });

  it("refuses to move through the left wall", () => {
    const game = new Tetris(() => 0);
    game.setCurrent("O", 0, 0, 0);
    expect(game.move(-1, 0)).toBe(false);
  });

  it("ends the game when the stack reaches the top", () => {
    const game = new Tetris(() => 0);
    // Fill the whole board except column 0, so no row is ever complete (nothing
    // clears) and the centre is occupied up to the top.
    const board = Array.from({ length: HEIGHT }, () => {
      const row = Array<number>(WIDTH).fill(1);
      row[0] = 0;
      return row;
    });
    game.setBoard(board);
    game.setCurrent("O", 4, 0);
    game.hardDrop(); // locks with no line clear; the next spawn has nowhere to go
    expect(game.over).toBe(true);
  });

  it("is deterministic for a fixed rng (same bag order)", () => {
    const seq = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    };
    const a = new Tetris(seq(5));
    const b = new Tetris(seq(5));
    const nexts: string[] = [];
    for (let i = 0; i < 10; i++) {
      nexts.push(a.snapshot().next);
      a.hardDrop();
    }
    const other: string[] = [];
    for (let i = 0; i < 10; i++) {
      other.push(b.snapshot().next);
      b.hardDrop();
    }
    expect(nexts).toEqual(other);
  });
});
