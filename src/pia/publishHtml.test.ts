import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdownHtml, pageTitle } from "./publishHtml.js";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("renderMarkdownHtml — blocks", () => {
  it("renders headings at the right level", () => {
    expect(renderMarkdownHtml("# Hi")).toBe("<h1>Hi</h1>");
    expect(renderMarkdownHtml("### Deep")).toBe("<h3>Deep</h3>");
  });

  it("wraps prose in paragraphs, joining wrapped lines", () => {
    expect(renderMarkdownHtml("one\ntwo\n\nthree")).toBe("<p>one two</p>\n<p>three</p>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdownHtml("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
    expect(renderMarkdownHtml("1. a\n2. b")).toBe("<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
  });

  it("renders blockquotes and horizontal rules", () => {
    expect(renderMarkdownHtml("> quoted")).toBe("<blockquote>quoted</blockquote>");
    expect(renderMarkdownHtml("---")).toBe("<hr>");
  });

  it("renders a fenced code block literally, without inline processing", () => {
    const html = renderMarkdownHtml("```\n**not bold** <tag>\n```");
    expect(html).toBe("<pre><code>**not bold** &lt;tag&gt;</code></pre>");
  });

  it("handles an indented heading without spinning (regression: infinite loop)", () => {
    // A heading with leading whitespace used to start no block and consume no
    // line, freezing the renderer. It must terminate and render as a heading.
    expect(renderMarkdownHtml("  # Title")).toBe("<h1>Title</h1>");
    expect(renderMarkdownHtml("intro\n\n   ## Sub\nbody")).toBe(
      "<p>intro</p>\n<h2>Sub</h2>\n<p>body</p>",
    );
  });
});

describe("renderMarkdownHtml — inline", () => {
  it("renders bold, italic, and code spans", () => {
    expect(renderMarkdownHtml("**b** and *i* and `c`")).toBe(
      "<p><strong>b</strong> and <em>i</em> and <code>c</code></p>",
    );
  });

  it("does not treat a bare number as a code-span placeholder", () => {
    // Regression: the code-span slot must not collide with real digits.
    expect(renderMarkdownHtml("we meet at 5 pm")).toBe("<p>we meet at 5 pm</p>");
    expect(renderMarkdownHtml("`x` at 0 and `y`")).toBe(
      "<p><code>x</code> at 0 and <code>y</code></p>",
    );
  });

  it("keeps code-span contents literal", () => {
    expect(renderMarkdownHtml("`<b>&`")).toBe("<p><code>&lt;b&gt;&amp;</code></p>");
  });
});

describe("renderMarkdownHtml — safety", () => {
  it("escapes raw HTML in prose", () => {
    expect(renderMarkdownHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("keeps http(s) and relative links but neuters javascript: URLs", () => {
    expect(renderMarkdownHtml("[x](https://a.example)")).toBe(
      '<p><a href="https://a.example">x</a></p>',
    );
    expect(renderMarkdownHtml("[x](/about)")).toBe('<p><a href="/about">x</a></p>');
    expect(renderMarkdownHtml("[x](javascript:alert)")).toBe('<p><a href="#">x</a></p>');
    // Protocol-relative is rejected; bare relative links between pages are kept.
    expect(renderMarkdownHtml("[x](//evil.example)")).toBe('<p><a href="#">x</a></p>');
    expect(renderMarkdownHtml("[About](about)")).toBe('<p><a href="about">About</a></p>');
    expect(renderMarkdownHtml("[x](posts/one)")).toBe('<p><a href="posts/one">x</a></p>');
  });

  it("escapes an ampersand in a link target exactly once (regression: &amp;amp;)", () => {
    expect(renderMarkdownHtml("[x](https://e.test/?a=1&b=2)")).toBe(
      '<p><a href="https://e.test/?a=1&amp;b=2">x</a></p>',
    );
    expect(renderMarkdownHtml("[x](data:text/html,hi)")).toBe('<p><a href="#">x</a></p>');
  });
});

describe("pageTitle", () => {
  it("uses the first heading", () => {
    expect(pageTitle("intro\n# Real Title\nmore", "x.md")).toBe("Real Title");
  });
  it("falls back to the filename without extension", () => {
    expect(pageTitle("no heading here", "2026-solresor.md")).toBe("2026-solresor");
  });
});
