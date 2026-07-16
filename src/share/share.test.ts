import { describe, expect, it } from "vitest";
import { encodeShare, decodeShare, parseShareHash } from "./share.js";

describe("share encoding", () => {
  it("round-trips a file", () => {
    const file = { name: "notes.txt", content: "hello\nworld" };
    expect(decodeShare(encodeShare(file))).toEqual(file);
  });

  it("survives unicode content", () => {
    const file = { name: "hej.txt", content: "räksmörgås · 日本語 · 🐍" };
    expect(decodeShare(encodeShare(file))).toEqual(file);
  });

  it("produces a URL-safe payload (no + / =)", () => {
    const payload = encodeShare({ name: "a", content: "?".repeat(100) });
    expect(payload).not.toMatch(/[+/=]/);
  });

  it("returns null for a malformed payload", () => {
    expect(decodeShare("not-valid-base64!!")).toBeNull();
  });

  it("extracts a file from a URL hash", () => {
    const payload = encodeShare({ name: "x.txt", content: "hi" });
    expect(parseShareHash(`#s=${payload}`)).toEqual({ name: "x.txt", content: "hi" });
  });

  it("returns null when the hash has no share", () => {
    expect(parseShareHash("#something-else")).toBeNull();
  });
});
