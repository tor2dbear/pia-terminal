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

describe("hasSecret (HISTIGNORE for password-bearing commands)", () => {
  it("flags the auth commands that take a secret inline", () => {
    expect(hasSecret("passwd hunter2")).toBe(true);
    expect(hasSecret("login me@example.com hunter2")).toBe(true);
    expect(hasSecret("useradd bob bob@example.com hunter2")).toBe(true);
    expect(hasSecret("register bob bob@example.com hunter2")).toBe(true);
  });

  it("catches a secret command hidden in a chained/piped line", () => {
    expect(hasSecret("login a b && ls")).toBe(true);
    expect(hasSecret("echo hi; passwd s3cret")).toBe(true);
    expect(hasSecret("ls || login a b")).toBe(true);
  });

  it("leaves ordinary lines (incl. a file merely named `passwd`) alone", () => {
    expect(hasSecret("ls -la")).toBe(false);
    expect(hasSecret("cat passwd")).toBe(false); // `passwd` is an argument, not the command
    expect(hasSecret("grep login notes.md")).toBe(false);
    expect(hasSecret("")).toBe(false);
  });
});
