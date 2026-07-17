import type { LineClass } from "../commands/registry.js";
import type { RenderedLine } from "./markdown.js";

/**
 * Pretty-print JSON and colour it line by line — PIA's `json_pp`. The terminal
 * prints one colour class per line, so structural braces/brackets go dim, lines
 * that start with a `"key":` are accent, and bare values (array elements) are
 * normal. Throws SyntaxError on invalid JSON so the command can report it.
 */
export function renderJson(src: string): RenderedLine[] {
  const value = JSON.parse(src) as unknown;
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((text) => ({ text, cls: classify(text) }));
}

function classify(line: string): LineClass {
  const t = line.trim();
  if (t === "" || /^[[\]{},]+$/.test(t)) return "dim"; // structure only
  if (/^"(?:[^"\\]|\\.)*"\s*:/.test(t)) return "accent"; // "key": …
  return "normal"; // a bare value
}
