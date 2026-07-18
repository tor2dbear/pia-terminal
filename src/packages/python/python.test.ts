import { describe, expect, it } from "vitest";
import { parsePythonArgs } from "./index.js";

const files: Record<string, string> = { "hello.py": "print('hi')" };
const read = (path: string): string | null => files[path] ?? null;

describe("parsePythonArgs", () => {
  it("shows usage with no arguments", () => {
    expect(parsePythonArgs([], read)).toEqual({ usage: true });
  });

  it("takes inline code with -c", () => {
    expect(parsePythonArgs(["-c", "print(1", "+", "2)"], read)).toEqual({
      code: "print(1 + 2)",
    });
  });

  it("errors when -c has no code", () => {
    expect(parsePythonArgs(["-c"], read)).toEqual({ error: "python: -c: no code given" });
  });

  it("reads a file argument from the VFS", () => {
    expect(parsePythonArgs(["hello.py"], read)).toEqual({ code: "print('hi')" });
  });

  it("errors on a missing file", () => {
    const r = parsePythonArgs(["nope.py"], read);
    expect(r).toEqual({ error: "python: can't open file 'nope.py'" });
  });
});
