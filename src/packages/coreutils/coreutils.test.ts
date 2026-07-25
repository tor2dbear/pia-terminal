import { describe, expect, it } from "vitest";
import { reverseLine, base64Encode, base64Decode, factorize, hexdump } from "./coreutils.js";
import { pkg } from "./index.js";
import { VFS, HOME } from "../../vfs/vfs.js";
import type { CoreCommandContext } from "../../commands/registry.js";

/** A minimal context that records printed and errored lines. */
function stubCtx(stdin = "") {
  const lines: { text: string; err: boolean }[] = [];
  const ctx = {
    stdin,
    print: (text = "") => lines.push({ text, err: false }),
    error: (text: string) => lines.push({ text, err: true }),
  } as unknown as CoreCommandContext;
  const cmd = (name: string) => pkg.commands.find((c) => c.name === name)!;
  return { ctx, lines, cmd };
}

/** A context backed by a real VFS with two unterminated files, `a` and `b`. */
function twoFileCtx() {
  const vfs = VFS.seed();
  vfs.writeFile(`${HOME}/a`, "a");
  vfs.writeFile(`${HOME}/b`, "b");
  const lines: { text: string; err: boolean }[] = [];
  const ctx = {
    vfs,
    cwd: HOME,
    stdin: "",
    print: (text = "") => lines.push({ text, err: false }),
    error: (text: string) => lines.push({ text, err: true }),
  } as unknown as CoreCommandContext;
  const cmd = (name: string) => pkg.commands.find((c) => c.name === name)!;
  return { ctx, lines, cmd };
}

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

  it("refuses a value past Number's safe range (would round silently)", async () => {
    const { ctx, lines, cmd } = stubCtx();
    await cmd("factor").run(["9007199254740993"], ctx);
    expect(lines.some((l) => l.err && /too large/.test(l.text))).toBe(true);
    // Crucially, it did not print a (wrong) factorisation.
    expect(lines.some((l) => !l.err && l.text.includes(":"))).toBe(false);
  });

  it("still factors a normal number through the command", async () => {
    const { ctx, lines, cmd } = stubCtx();
    await cmd("factor").run(["12"], ctx);
    expect(lines).toEqual([{ text: "12: 2 2 3", err: false }]);
  });
});

describe("multiple files concatenate byte-for-byte (no invented newline)", () => {
  it("rev joins unterminated files into one line", async () => {
    const { ctx, lines, cmd } = twoFileCtx();
    await cmd("rev").run(["a", "b"], ctx);
    // "a" + "b" = "ab" is a single line → "ba", not two lines "a","b".
    expect(lines.map((l) => l.text)).toEqual(["ba"]);
  });

  it("base64 encodes the concatenation, not a separator-injected version", async () => {
    const { ctx, lines, cmd } = twoFileCtx();
    await cmd("base64").run(["a", "b"], ctx);
    expect(lines.map((l) => l.text)).toEqual([base64Encode("ab")]); // "YWI=", not base64("a\nb")
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
