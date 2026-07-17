import { describe, expect, it } from "vitest";
import { renderJson } from "./json.js";

describe("renderJson", () => {
  it("pretty-prints with two-space indent", () => {
    expect(renderJson('{"a":1}').map((l) => l.text)).toEqual(["{", '  "a": 1', "}"]);
  });

  it("colours keys accent and structure dim", () => {
    const lines = renderJson('{"name":"x"}');
    expect(lines[0]).toEqual({ text: "{", cls: "dim" });
    expect(lines[1].cls).toBe("accent"); // "name": "x"
    expect(lines[2]).toEqual({ text: "}", cls: "dim" });
  });

  it("leaves bare array values normal", () => {
    const lines = renderJson("[1, 2]");
    expect(lines.find((l) => l.text.trim() === "1,")?.cls).toBe("normal");
  });

  it("preserves numeric lexemes exactly, without round-tripping through Number", () => {
    // 9007199254740993 > MAX_SAFE_INTEGER, and 1e400 overflows a double — both
    // would be corrupted by JSON.parse + JSON.stringify.
    expect(renderJson('{"id":9007199254740993}').map((l) => l.text)).toEqual([
      "{",
      '  "id": 9007199254740993',
      "}",
    ]);
    expect(renderJson('{"big":1e400}').map((l) => l.text)).toEqual(["{", '  "big": 1e400', "}"]);
  });

  it("handles nested and empty containers", () => {
    expect(renderJson('{"a":[],"b":{}}').map((l) => l.text)).toEqual([
      "{",
      '  "a": [],',
      '  "b": {}',
      "}",
    ]);
  });

  it("throws on invalid JSON", () => {
    expect(() => renderJson("{nope")).toThrow();
  });
});
