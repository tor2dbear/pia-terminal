// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PythonRepl } from "./repl.js";
import type { PythonResult } from "./bridge.js";

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function result(partial: Partial<PythonResult>): PythonResult {
  return { stdout: "", stderr: "", result: null, error: null, incomplete: false, files: {}, ...partial };
}

function mount(runner: (source: string) => Promise<PythonResult>): PythonRepl {
  const repl = new PythonRepl(
    () => {},
    (source) => runner(source),
  );
  repl.mount(document.createElement("div"));
  return repl;
}

const type = (repl: PythonRepl, text: string): void => repl.onText(text);
const enter = (repl: PythonRepl): void =>
  repl.onKey(new KeyboardEvent("keydown", { key: "Enter" }));

describe("PythonRepl", () => {
  it("evaluates a line and echoes prompt + result", async () => {
    const calls: string[] = [];
    const repl = mount(async (source) => {
      calls.push(source);
      return result({ result: "4" });
    });
    type(repl, "2+2");
    enter(repl);
    await flush();

    const snap = repl.snapshot();
    expect(calls).toEqual(["2+2"]);
    expect(snap.out).toContain(">>> 2+2");
    expect(snap.out).toContain("4");
    expect(snap.prompt).toBe(">>> ");
    expect(snap.busy).toBe(false);
  });

  it("keeps a block open with a `...` prompt until it's complete", async () => {
    const repl = mount(async (source) =>
      result({ incomplete: source === "def f():" || source === "def f():\n    return 1" }),
    );

    type(repl, "def f():");
    enter(repl);
    await flush();
    expect(repl.snapshot().prompt).toBe("... "); // block open

    type(repl, "    return 1");
    enter(repl);
    await flush();
    expect(repl.snapshot().prompt).toBe("... "); // still open

    enter(repl); // blank line finishes the block
    await flush();
    const snap = repl.snapshot();
    expect(snap.prompt).toBe(">>> "); // back to a fresh statement
    expect(snap.out).toContain(">>> def f():");
    expect(snap.out).toContain("...     return 1");
  });

  it("prints stdout and errors", async () => {
    const repl = mount(async () => result({ stdout: "hello\nworld\n", error: "ValueError: boom" }));
    type(repl, "go()");
    enter(repl);
    await flush();
    const out = repl.snapshot().out;
    expect(out).toContain("hello");
    expect(out).toContain("world");
    expect(out).toContain("ValueError: boom");
  });

  it("exits on exit()", () => {
    let exited = false;
    const repl = new PythonRepl(
      () => {
        exited = true;
      },
      async () => result({}),
    );
    repl.mount(document.createElement("div"));
    type(repl, "exit()");
    enter(repl);
    expect(exited).toBe(true);
  });
});
