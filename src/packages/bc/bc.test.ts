import { describe, expect, it } from "vitest";
import { evalExpr } from "./bc.js";

describe("evalExpr", () => {
  it("respects precedence", () => {
    expect(evalExpr("2 + 3 * 4")).toBe(14);
    expect(evalExpr("(2 + 3) * 4")).toBe(20);
  });

  it("handles unary minus and subtraction", () => {
    expect(evalExpr("-5 + 2")).toBe(-3);
    expect(evalExpr("10 - -4")).toBe(14);
  });

  it("does power right-associatively", () => {
    expect(evalExpr("2 ^ 3 ^ 2")).toBe(512); // 2^(3^2), not (2^3)^2=64
    expect(evalExpr("-2 ^ 2")).toBe(-4); // unary minus binds looser than ^
  });

  it("does modulo and division", () => {
    expect(evalExpr("17 % 5")).toBe(2);
    expect(evalExpr("9 / 2")).toBe(4.5);
  });

  it("parses decimals", () => {
    expect(evalExpr("0.1 + 0.2")).toBeCloseTo(0.3);
  });

  it("throws on divide by zero", () => {
    expect(() => evalExpr("1 / 0")).toThrow(/divide by zero/);
  });

  it("throws on malformed input", () => {
    expect(() => evalExpr("2 +")).toThrow();
    expect(() => evalExpr("(1 + 2")).toThrow(/parenthesis/);
    expect(() => evalExpr("2 3")).toThrow();
    expect(() => evalExpr("2 @ 3")).toThrow(/unexpected character/);
  });
});
