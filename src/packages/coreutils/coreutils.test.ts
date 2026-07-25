import { describe, expect, it } from "vitest";
import { reverseLine, base64Encode, base64Decode, factorize, hexdump } from "./coreutils.js";

describe("rev", () => {
  it("reverses characters", () => {
    expect(reverseLine("hello")).toBe("olleh");
  });
  it("is code-point aware", () => {
    expect(reverseLine("ab🙂")).toBe("🙂ba");
  });
  it("leaves an empty line empty", () => {
    expect(reverseLine("")).toBe("");
  });
});

describe("base64", () => {
  it("round-trips UTF-8 text", () => {
    const s = "PIA — a little computer 🖥";
    expect(base64Decode(base64Encode(s))).toBe(s);
  });
  it("matches known vectors", () => {
    expect(base64Encode("hello")).toBe("aGVsbG8=");
    expect(base64Decode("aGVsbG8=")).toBe("hello");
  });
  it("ignores whitespace when decoding", () => {
    expect(base64Decode("aGVs bG8=\n")).toBe("hello");
  });
  it("throws on invalid input", () => {
    expect(() => base64Decode("!!!not base64!!!")).toThrow();
  });
});

describe("factor", () => {
  it("factors a composite", () => {
    expect(factorize(12)).toEqual([2, 2, 3]);
  });
  it("leaves a prime as itself", () => {
    expect(factorize(13)).toEqual([13]);
  });
  it("returns nothing for 1", () => {
    expect(factorize(1)).toEqual([]);
  });
  it("handles a larger semiprime", () => {
    expect(factorize(1001)).toEqual([7, 11, 13]);
  });
});

describe("xxd", () => {
  it("dumps in canonical layout", () => {
    // "hello\n" → offset, hex pairs, then the ASCII gutter.
    expect(hexdump("hello\n")).toEqual([
      "00000000: 6865 6c6c 6f0a                           hello.",
    ]);
  });
  it("wraps at 16 bytes per line", () => {
    const dump = hexdump("0123456789abcdefX");
    expect(dump).toHaveLength(2);
    expect(dump[1].startsWith("00000010: 58")).toBe(true); // the 17th byte, 'X'
  });
  it("dumps nothing for empty input", () => {
    expect(hexdump("")).toEqual([]);
  });
});
