import { describe, expect, it } from "vitest";
import { formatColumns } from "./table.js";

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
});
