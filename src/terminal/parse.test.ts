import { describe, expect, it } from "vitest";
import { tokenize } from "./parse.js";

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("ls -r foo")).toEqual(["ls", "-r", "foo"]);
  });

  it("collapses repeated spaces", () => {
    expect(tokenize("echo   a    b")).toEqual(["echo", "a", "b"]);
  });

  it("keeps quoted spans together", () => {
    expect(tokenize('touch "mina filer.txt"')).toEqual([
      "touch",
      "mina filer.txt",
    ]);
  });

  it("keeps an empty quoted token", () => {
    expect(tokenize('echo ""')).toEqual(["echo", ""]);
  });

  it("returns nothing for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});
