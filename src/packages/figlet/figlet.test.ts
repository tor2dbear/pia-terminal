import { describe, expect, it } from "vitest";
import { figlet } from "./figlet.js";

describe("figlet", () => {
  it("renders 5 rows of equal width", () => {
    const rows = figlet("PIA");
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1); // columns line up
  });

  it("maps lowercase to uppercase", () => {
    expect(figlet("pia")).toEqual(figlet("PIA"));
  });

  it("skips an unknown glyph (as if it weren't there)", () => {
    expect(figlet("A~B")).toEqual(figlet("AB"));
  });
});
