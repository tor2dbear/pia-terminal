import { describe, expect, it } from "vitest";
import { expandArg, expandArgs, WILD_STAR, type GlobFs } from "./glob.js";

/** A tiny fake filesystem: absolute dir path → entry names. */
function fakeFs(dirs: Record<string, string[]>): GlobFs {
  return {
    resolve: (cwd, path) => {
      const p = path.replace(/\/$/, ""); // drop the trailing slash on a dir part
      if (p === "" || p === ".") return cwd;
      if (p.startsWith("/")) return p;
      return (cwd === "/" ? "" : cwd) + "/" + p;
    },
    entries: (dirAbs) => dirs[dirAbs] ?? null,
  };
}

const fs = fakeFs({
  "/home": ["a.md", "b.md", "c.txt", ".hidden", ".pia"],
  "/home/src": ["main.ts", "util.ts"],
});

describe("expandArg", () => {
  it("expands *.md to sorted matches", () => {
    expect(expandArg("*.md", "/home", fs)).toEqual(["a.md", "b.md"]);
  });

  it("expands a single extension", () => {
    expect(expandArg("*.txt", "/home", fs)).toEqual(["c.txt"]);
  });

  it("a leading * does not match dotfiles", () => {
    expect(expandArg("*", "/home", fs)).toEqual(["a.md", "b.md", "c.txt"]);
  });

  it("a literal leading dot does match dotfiles", () => {
    expect(expandArg(".*", "/home", fs)).toEqual([".hidden", ".pia"]);
  });

  it("? matches exactly one character", () => {
    expect(expandArg("?.md", "/home", fs)).toEqual(["a.md", "b.md"]);
  });

  it("globs the final segment under a directory prefix", () => {
    expect(expandArg("src/*.ts", "/home", fs)).toEqual([
      "src/main.ts",
      "src/util.ts",
    ]);
  });

  it("leaves a non-matching pattern literal (nullglob off)", () => {
    expect(expandArg("*.zip", "/home", fs)).toEqual(["*.zip"]);
  });

  it("passes a plain token through unchanged", () => {
    expect(expandArg("a.md", "/home", fs)).toEqual(["a.md"]);
  });

  it("leaves a wildcard under a missing directory literal", () => {
    expect(expandArg("nope/*.md", "/home", fs)).toEqual(["nope/*.md"]);
  });

  it("does not cross directories in v1 (wildcard in a non-final segment)", () => {
    expect(expandArg("*/*.ts", "/home", fs)).toEqual(["*/*.ts"]);
  });

  it("treats a shielded (quoted) wildcard as literal", () => {
    // The tokenizer produces this for `"*.md"`.
    expect(expandArg(WILD_STAR + ".md", "/home", fs)).toEqual(["*.md"]);
  });
});

describe("expandArgs", () => {
  it("flattens matches across args, in order", () => {
    expect(expandArgs(["*.md", "x", "*.txt"], "/home", fs)).toEqual([
      "a.md",
      "b.md",
      "x",
      "c.txt",
    ]);
  });
});
