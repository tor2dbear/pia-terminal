import type { LineClass } from "../commands/registry.js";
import type { RenderedLine } from "./markdown.js";

/**
 * Pretty-print JSON and colour it line by line — PIA's `json_pp`. The terminal
 * prints one colour class per line, so structural braces/brackets go dim, lines
 * that start with a `"key":` are accent, and bare values (array elements) are
 * normal. Throws SyntaxError on invalid JSON so the command can report it.
 *
 * The pretty-printer re-indents the original tokens rather than round-tripping
 * through `JSON.parse` + `JSON.stringify`, so numeric lexemes survive exactly —
 * a huge integer like 9007199254740993 or an overflowing 1e400 is shown as
 * written instead of being rounded or turned into `null`.
 */
export function renderJson(src: string): RenderedLine[] {
  JSON.parse(src); // validate only — throws on invalid input
  return prettyJson(src)
    .split("\n")
    .map((text) => ({ text, cls: classify(text) }));
}

/** Re-indent already-valid JSON, preserving every token's original text. */
function prettyJson(src: string): string {
  const toks = tokenize(src);
  let out = "";
  let depth = 0;
  const indent = (): string => "  ".repeat(depth);
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const prev = toks[i - 1];
    const next = toks[i + 1];
    switch (tok) {
      case "{":
      case "[":
        out += tok;
        if (next !== "}" && next !== "]") {
          depth++;
          out += `\n${indent()}`;
        }
        break;
      case "}":
      case "]":
        if (prev !== "{" && prev !== "[") {
          depth--;
          out += `\n${indent()}`;
        }
        out += tok;
        break;
      case ",":
        out += `,\n${indent()}`;
        break;
      case ":":
        out += ": ";
        break;
      default:
        out += tok; // string / number / literal, verbatim
    }
  }
  return out;
}

/** Split valid JSON into tokens, keeping strings and numbers as raw text. */
function tokenize(src: string): string[] {
  const toks: string[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\n" || c === "\t" || c === "\r") {
      i++;
    } else if (c === "{" || c === "}" || c === "[" || c === "]" || c === ":" || c === ",") {
      toks.push(c);
      i++;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === '"') {
          j++;
          break;
        } else j++;
      }
      toks.push(src.slice(i, j));
      i = j;
    } else {
      // number or literal: read up to the next delimiter
      let j = i;
      while (j < n && ` \n\t\r{}[]:,"`.indexOf(src[j]) === -1) j++;
      toks.push(src.slice(i, j));
      i = j;
    }
  }
  return toks;
}

function classify(line: string): LineClass {
  const t = line.trim();
  if (t === "" || /^[[\]{},]+$/.test(t)) return "dim"; // structure only
  if (/^"(?:[^"\\]|\\.)*"\s*:/.test(t)) return "accent"; // "key": …
  return "normal"; // a bare value
}
