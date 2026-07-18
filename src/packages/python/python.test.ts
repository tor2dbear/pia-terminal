import { describe, expect, it } from "vitest";
import { collectDirFiles, parsePythonArgs } from "./index.js";
import type { DirNode } from "../../vfs/types.js";

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

describe("collectDirFiles", () => {
  it("returns only the directory's own files, skipping subdirs", () => {
    const dir: DirNode = {
      type: "dir",
      name: "work",
      children: {
        "a.py": { type: "file", name: "a.py", content: "print(1)" },
        "notes.txt": { type: "file", name: "notes.txt", content: "hi" },
        sub: { type: "dir", name: "sub", children: {} },
      },
    };
    expect(collectDirFiles(dir)).toEqual({ "a.py": "print(1)", "notes.txt": "hi" });
  });

  it("handles a null node", () => {
    expect(collectDirFiles(null)).toEqual({});
  });
});
