// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { segmentUrls, fillLinkified } from "./linkify.js";

describe("segmentUrls", () => {
  it("leaves URL-free text as a single plain segment", () => {
    expect(segmentUrls("hello world")).toEqual([{ url: false, text: "hello world" }]);
  });

  it("splits a URL out of the surrounding text", () => {
    expect(segmentUrls("see https://x.com now")).toEqual([
      { url: false, text: "see " },
      { url: true, text: "https://x.com" },
      { url: false, text: " now" },
    ]);
  });

  it("keeps trailing punctuation out of the link", () => {
    expect(segmentUrls("go to https://x.com.")).toEqual([
      { url: false, text: "go to " },
      { url: true, text: "https://x.com" },
      { url: false, text: "." },
    ]);
  });

  it("keeps a balanced closing paren that's part of the URL", () => {
    expect(segmentUrls("https://en.wikipedia.org/wiki/Function_(mathematics)")).toEqual([
      { url: true, text: "https://en.wikipedia.org/wiki/Function_(mathematics)" },
    ]);
  });

  it("gives back an unmatched closing paren that wraps the URL", () => {
    expect(segmentUrls("see (https://x.com)")).toEqual([
      { url: false, text: "see (" },
      { url: true, text: "https://x.com" },
      { url: false, text: ")" },
    ]);
  });

  it("keeps the angle brackets of a Markdown autolink out of the URL", () => {
    expect(segmentUrls("<https://example.com/docs>")).toEqual([
      { url: false, text: "<" },
      { url: true, text: "https://example.com/docs" },
      { url: false, text: ">" },
    ]);
  });
});

describe("fillLinkified", () => {
  it("renders a URL as an anchor that opens safely in a new tab", () => {
    const el = document.createElement("div");
    fillLinkified(el, "source   https://github.com/tor2dbear/pia-terminal");
    const a = el.querySelector("a.term-link");
    expect(a?.getAttribute("href")).toBe("https://github.com/tor2dbear/pia-terminal");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(el.textContent).toContain("source");
  });

  it("leaves a plain line as text, with no anchors", () => {
    const el = document.createElement("div");
    fillLinkified(el, "just text");
    expect(el.querySelector("a")).toBeNull();
    expect(el.textContent).toBe("just text");
  });
});
