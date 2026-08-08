import { describe, expect, it } from "vitest";
import { appendHistory, hasSecret, parseHistory, serializeHistory, HISTSIZE } from "./history.js";

describe("history file helpers", () => {
  it("parses lines and drops blanks", () => {
    expect(parseHistory("ls\n\ncd notes\n")).toEqual(["ls", "cd notes"]);
    expect(parseHistory("")).toEqual([]);
  });

  it("round-trips through serialize (trailing newline, empty for none)", () => {
    expect(serializeHistory(["ls", "pwd"])).toBe("ls\npwd\n");
    expect(serializeHistory([])).toBe("");
    expect(parseHistory(serializeHistory(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("appends new commands without clobbering existing ones", () => {
    expect(appendHistory(["ls", "pwd"], ["cd ~", "cat x"])).toEqual(["ls", "pwd", "cd ~", "cat x"]);
  });

  it("skips a command that repeats the immediately preceding one (ignoredups)", () => {
    expect(appendHistory(["ls"], ["ls", "pwd", "pwd"])).toEqual(["ls", "pwd"]);
    // …but a repeat that isn't adjacent is kept (you did run it again later).
    expect(appendHistory(["ls", "pwd"], ["ls"])).toEqual(["ls", "pwd", "ls"]);
  });

  it("keeps only the most recent `cap` lines", () => {
    const existing = Array.from({ length: HISTSIZE }, (_, i) => `cmd${i}`);
    const capped = appendHistory(existing, ["newest"]);
    expect(capped).toHaveLength(HISTSIZE);
    expect(capped.at(-1)).toBe("newest");
    expect(capped[0]).toBe("cmd1"); // cmd0 fell off the front
  });

  it("interleaves two windows appending to the same file", () => {
    let file = ["boot"];
    file = appendHistory(file, ["A1"]); // window A
    file = appendHistory(file, ["B1"]); // window B
    file = appendHistory(file, ["A2"]); // window A again
    expect(file).toEqual(["boot", "A1", "B1", "A2"]);
  });
});

describe("hasSecret (HISTIGNORE membership test over resolved command names)", () => {
  it("flags a line whose commands include a password-bearing one", () => {
    expect(hasSecret(["passwd"])).toBe(true);
    expect(hasSecret(["login"])).toBe(true);
    expect(hasSecret(["echo", "passwd"])).toBe(true); // a secret command anywhere in a chain
    expect(hasSecret(["useradd"])).toBe(true);
    expect(hasSecret(["register"])).toBe(true);
    expect(hasSecret(["verify"])).toBe(true); // `verify <code>` carries a one-time code
  });

  it("leaves ordinary command sets alone (a `passwd` argument isn't a command)", () => {
    expect(hasSecret(["ls"])).toBe(false);
    expect(hasSecret(["cat"])).toBe(false); // `cat passwd` resolves to just ["cat"]
    expect(hasSecret(["grep", "echo"])).toBe(false);
    expect(hasSecret([])).toBe(false);
  });
});
