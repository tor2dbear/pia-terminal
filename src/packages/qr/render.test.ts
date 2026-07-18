import { describe, expect, it } from "vitest";
import { encodeQr, renderQr } from "./index.js";

describe("renderQr", () => {
  it("adds a quiet zone and halves the row count", () => {
    const modules = encodeQr("hi", "L"); // 21×21
    const lines = renderQr(modules, 4);
    const size = 21 + 8; // + quiet zone both sides = 29
    expect(lines.length).toBe(Math.ceil(size / 2)); // two module rows per line
    for (const line of lines) expect([...line].length).toBe(size);
  });

  it("leaves a blank quiet-zone border (first line all light)", () => {
    const lines = renderQr(encodeQr("hi", "L"), 4);
    // The first two module rows are quiet zone → the top line is all spaces.
    expect(lines[0].trim()).toBe("");
  });

  it("only uses block glyphs and spaces", () => {
    const lines = renderQr(encodeQr("test", "M"));
    const joined = lines.join("\n");
    expect(joined).toMatch(/^[█▀▄ \n]+$/);
  });
});
