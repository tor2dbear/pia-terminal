import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./markdownHtml.js";

describe("renderMarkdownToHtml", () => {
  it("renders headings, paragraphs and rules", () => {
    const html = renderMarkdownToHtml("# Title\n\nA paragraph.\n\n---");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>A paragraph.</p>");
    expect(html).toContain("<hr>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdownToHtml("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdownToHtml("1. one\n2. two")).toBe(
      "<ol><li>one</li><li>two</li></ol>",
    );
  });

  it("renders fenced code verbatim and escaped", () => {
    const html = renderMarkdownToHtml("```\n<b>x</b> & y\n```");
    expect(html).toContain("<pre><code>&lt;b&gt;x&lt;/b&gt; &amp; y</code></pre>");
  });

  it("renders inline bold, italic and code", () => {
    const html = renderMarkdownToHtml("a **b** _c_ `d`");
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<em>c</em>");
    expect(html).toContain("<code>d</code>");
  });

  it("renders safe links as anchors and rejects unsafe schemes", () => {
    expect(renderMarkdownToHtml("[site](https://example.com)")).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>',
    );
    const evil = renderMarkdownToHtml("[x](javascript:alert(1))");
    expect(evil).not.toContain("<a ");
    expect(evil).toContain("javascript:alert(1)"); // shown as plain text, not a link
  });

  it("escapes HTML so a document cannot inject markup", () => {
    const html = renderMarkdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
