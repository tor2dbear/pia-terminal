import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.js";

const text = (src: string) => renderMarkdown(src).map((l) => l.text);

describe("renderMarkdown", () => {
  it("renders an h1 as uppercase accent with an underline rule", () => {
    const lines = renderMarkdown("# Hello");
    expect(lines[0]).toEqual({ text: "HELLO", cls: "accent" });
    expect(lines[1].cls).toBe("dim");
    expect(lines[1].text).toMatch(/^─+$/);
  });

  it("marks sub-headings accent", () => {
    const [h2] = renderMarkdown("## Sub");
    expect(h2.cls).toBe("accent");
    expect(h2.text).toContain("Sub");
  });

  it("bullets unordered lists and keeps ordered numbers", () => {
    expect(text("- one\n- two")).toEqual(["• one", "• two"]);
    expect(text("1. first\n2. second")).toEqual(["1. first", "2. second"]);
  });

  it("prefixes blockquotes and dims them", () => {
    const [q] = renderMarkdown("> quoted");
    expect(q).toEqual({ text: "│ quoted", cls: "dim" });
  });

  it("renders fenced code verbatim and dim, dropping the fences", () => {
    const lines = renderMarkdown("```\nconst x = 1;\n```");
    expect(lines).toEqual([{ text: "const x = 1;", cls: "dim" }]);
  });

  it("turns a rule into a dim line", () => {
    const [hr] = renderMarkdown("---");
    expect(hr.cls).toBe("dim");
    expect(hr.text).toMatch(/^─+$/);
  });

  it("unwraps inline bold, italic, code and links", () => {
    expect(text("**b** and *i* and `c`")).toEqual(["b and i and c"]);
    expect(text("see [docs](http://x)")).toEqual(["see docs (http://x)"]);
  });

  it("keeps underscores in identifiers, code spans and link URLs", () => {
    expect(text("call user_account_id now")).toEqual(["call user_account_id now"]);
    expect(text("`user_account_id`")).toEqual(["user_account_id"]);
    expect(text("[x](http://a_b_c)")).toEqual(["x (http://a_b_c)"]);
  });

  it("still unwraps real underscore emphasis at word boundaries", () => {
    expect(text("_hi_ there")).toEqual(["hi there"]);
  });

  it("only closes a fence with one at least as long as the opener", () => {
    // A 4-backtick fence around a ``` example: the inner fences are content.
    expect(renderMarkdown("````\n```\ncode\n```\n````")).toEqual([
      { text: "```", cls: "dim" },
      { text: "code", cls: "dim" },
      { text: "```", cls: "dim" },
    ]);
  });
});
