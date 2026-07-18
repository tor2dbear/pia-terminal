import { describe, expect, it } from "vitest";
import {
  encodePublish,
  decodePublish,
  parsePublishHash,
  type PublishedSite,
} from "./publish.js";

const site: PublishedSite = {
  title: "notes",
  pages: [
    { name: "index.md", content: "# Hello\n\nWorld." },
    { name: "about.md", content: "About **me** — åäö 🌱" },
  ],
};

describe("publish encode/decode", () => {
  it("round-trips a site through the payload", () => {
    const decoded = decodePublish(encodePublish(site));
    expect(decoded).toEqual(site);
  });

  it("preserves page order and unicode", () => {
    const decoded = decodePublish(encodePublish(site));
    expect(decoded?.pages.map((p) => p.name)).toEqual(["index.md", "about.md"]);
    expect(decoded?.pages[1].content).toContain("åäö 🌱");
  });

  it("pulls a site out of a #p= hash", () => {
    const payload = encodePublish(site);
    expect(parsePublishHash(`#p=${payload}`)?.title).toBe("notes");
    expect(parsePublishHash(`#foo=1&p=${payload}`)?.pages).toHaveLength(2);
  });

  it("returns null for a missing or malformed payload", () => {
    expect(parsePublishHash("#s=abc")).toBeNull(); // a share hash, not publish
    expect(decodePublish("not-valid-base64!!")).toBeNull();
    expect(decodePublish(btoa(JSON.stringify({ t: "x" })))).toBeNull(); // no pages
    expect(decodePublish(btoa(JSON.stringify({ t: "x", p: [] })))).toBeNull(); // empty
  });
});
