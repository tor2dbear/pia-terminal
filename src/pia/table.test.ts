import { describe, expect, it } from "vitest";
import { formatColumns, displayWidth } from "./table.js";

describe("formatColumns", () => {
  it("aligns comma-separated rows into a table", () => {
    expect(formatColumns(["a,bb,c", "dd,e,fff"], ",")).toEqual(["a   bb  c", "dd  e   fff"]);
  });

  it("splits on whitespace by default", () => {
    expect(formatColumns(["x  y", "aa bb"])).toEqual(["x   y", "aa  bb"]);
  });

  it("drops blank lines", () => {
    expect(formatColumns(["a,b", "", "c,d"], ",")).toEqual(["a  b", "c  d"]);
  });

  it("handles ragged rows", () => {
    expect(formatColumns(["a,b,c", "d,e"], ",")).toEqual(["a  b  c", "d  e"]);
  });

  it("trims cells around the separator", () => {
    expect(formatColumns(["a , b", "cc , d"], ",")).toEqual(["a   b", "cc  d"]);
  });

  it("measures display width: wide chars count as two, combining as zero", () => {
    expect(displayWidth("ab")).toBe(2);
    expect(displayWidth("世")).toBe(2); // CJK, one code point, two columns
    expect(displayWidth("😀")).toBe(2); // astral emoji, one grapheme
    expect(displayWidth("é")).toBe(1); // "é" as e + combining accent
  });

  it("aligns by display width, not string length", () => {
    // "世" is one UTF-16 unit but two display columns; the next field must still
    // line up with "ab" below it.
    expect(formatColumns(["世,x", "ab,y"], ",")).toEqual(["世  x", "ab  y"]);
  });
});
