import { describe, expect, it } from "vitest";
import { renderFrame, trainLines, trainWidth, SteamLoco } from "./sl.js";

describe("sl frame rendering", () => {
  it("places the train's left edge at the offset column", () => {
    const rows = renderFrame(10, 78, 0);
    const body = trainLines(0);
    // Row 0 begins with 10 spaces (trimmed on the right), then the train.
    const firstNonSpace = rows[0].search(/\S/);
    expect(firstNonSpace).toBe(10 + body[0].search(/\S/));
  });

  it("clips the train when it runs off the left edge", () => {
    const rows = renderFrame(-5, 78, 0);
    const body = trainLines(0);
    // Offset -5 drops the first 5 columns of every line.
    expect(rows[0]).toBe(body[0].slice(5).replace(/\s+$/, ""));
  });

  it("alternates the wheel row by phase", () => {
    expect(renderFrame(0, 78, 0)).not.toEqual(renderFrame(0, 78, 1));
  });

  it("reports a train width matching the widest line", () => {
    expect(trainWidth()).toBe(Math.max(...trainLines(0).map((l) => l.length)));
  });
});

describe("SteamLoco lifecycle", () => {
  it("finishes once the train clears the left edge", () => {
    let exited = false;
    const loco = new SteamLoco(() => {
      exited = true;
    });
    // Drive it well past the far edge.
    for (let i = 0; i < 78 + trainWidth() + 5; i++) loco.tick();
    expect(loco.snapshot().done).toBe(true);
    expect(exited).toBe(true);
  });
});
