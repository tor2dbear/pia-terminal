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

  it("throws on invalid JSON", () => {
    expect(() => renderJson("{nope")).toThrow();
  });
});
