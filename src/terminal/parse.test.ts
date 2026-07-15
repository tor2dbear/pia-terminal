import { describe, expect, it } from "vitest";
import { tokenize, parsePipeline } from "./parse.js";

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

describe("parsePipeline", () => {
  const unwrap = (line: string) => {
    const r = parsePipeline(line);
    if (!r.ok) throw new Error(r.error);
    return r.pipeline;
  };

  it("parses a single command", () => {
    expect(unwrap("ls -l /home")).toEqual({
      stages: [{ name: "ls", args: ["-l", "/home"] }],
      redirect: null,
    });
  });

  it("splits stages on |", () => {
    const p = unwrap("cat notes.txt | grep todo | wc -l");
    expect(p.stages.map((s) => s.name)).toEqual(["cat", "grep", "wc"]);
    expect(p.stages[1].args).toEqual(["todo"]);
  });

  it("parses a > redirect", () => {
    expect(unwrap("ls > files.txt").redirect).toEqual({
      file: "files.txt",
      append: false,
    });
  });

  it("parses a >> append redirect combined with a pipe", () => {
    const p = unwrap("ls | grep t >> out.txt");
    expect(p.stages.map((s) => s.name)).toEqual(["ls", "grep"]);
    expect(p.redirect).toEqual({ file: "out.txt", append: true });
  });

  it("keeps a quoted pipe literal", () => {
    const p = unwrap('echo "a | b"');
    expect(p.stages).toEqual([{ name: "echo", args: ["a | b"] }]);
  });

  it("rejects a leading pipe", () => {
    const r = parsePipeline("| grep x");
    expect(r.ok).toBe(false);
  });

  it("rejects a redirect with no filename", () => {
    const r = parsePipeline("ls >");
    expect(r.ok).toBe(false);
  });

  it("parses blank input as zero stages", () => {
    expect(unwrap("")).toEqual({ stages: [], redirect: null });
  });
});
