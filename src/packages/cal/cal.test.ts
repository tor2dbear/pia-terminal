import { describe, expect, it } from "vitest";
import { renderCal } from "./cal.js";

describe("renderCal", () => {
  it("titles and headers a month", () => {
    const out = renderCal(7, 2026);
    expect(out[0]).toContain("July 2026");
    expect(out[1]).toBe("Su Mo Tu We Th Fr Sa");
  });

  it("aligns the first day under its weekday", () => {
    // 1 July 2026 is a Wednesday → three leading blank cells (Su Mo Tu),
    // then Wed=1 .. Sat=4, each cell 2-wide and space-separated.
    const out = renderCal(7, 2026);
    expect(out[2]).toBe("          1  2  3  4");
  });

  it("ends on the correct last day", () => {
    // July has 31 days.
    const out = renderCal(7, 2026);
    const days = out
      .slice(2)
      .join(" ")
      .trim()
      .split(/\s+/)
      .map(Number);
    expect(Math.max(...days)).toBe(31);
  });

  it("handles February in a leap year", () => {
    // 2024 is a leap year → 29 days.
    const out = renderCal(2, 2024);
    const days = out.slice(2).join(" ").trim().split(/\s+/).map(Number);
    expect(Math.max(...days)).toBe(29);
  });
});
