import { describe, expect, it } from "vitest";
import { tokenize, parsePipeline, parseSequence } from "./parse.js";

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

describe("parseSequence", () => {
  const items = (line: string) => {
    const r = parseSequence(line);
    if (!r.ok) throw new Error(r.error);
    return r.items;
  };

  it("returns one null-connector item for a plain pipeline", () => {
    const it = items("ls -l");
    expect(it).toHaveLength(1);
    expect(it[0].connector).toBeNull();
    expect(it[0].pipeline.stages.map((s) => s.name)).toEqual(["ls"]);
  });

  it("splits on ; && ||, recording each connector", () => {
    const it = items("a && b || c ; d");
    expect(it.map((x) => x.connector)).toEqual([null, "&&", "||", ";"]);
    expect(it.map((x) => x.pipeline.stages[0].name)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps a single | as a pipe inside one item", () => {
    const it = items("cat f | grep x && echo done");
    expect(it).toHaveLength(2);
    expect(it[0].pipeline.stages.map((s) => s.name)).toEqual(["cat", "grep"]);
    expect(it[1].connector).toBe("&&");
  });

  it("shields operators inside quotes", () => {
    const it = items('echo "a && b ; c"');
    expect(it).toHaveLength(1);
    expect(it[0].pipeline.stages[0].args).toEqual(["a && b ; c"]);
  });

  it("allows a trailing semicolon", () => {
    const it = items("ls ;");
    expect(it).toHaveLength(1);
    expect(it[0].pipeline.stages[0].name).toBe("ls");
  });

  it("rejects a leading operator", () => {
    expect(parseSequence("&& ls").ok).toBe(false);
  });

  it("rejects an empty operand between operators", () => {
    expect(parseSequence("ls && && echo").ok).toBe(false);
  });
});
