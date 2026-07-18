import { WILD_STAR, WILD_QUES } from "./glob.js";

/**
 * A wildcard typed inside quotes is literal, so replace it with a sentinel the
 * globber leaves alone; unquoted `*`/`?` pass through as real wildcards.
 */
const shield = (ch: string, inQuotes: boolean): string =>
  !inQuotes ? ch : ch === "*" ? WILD_STAR : ch === "?" ? WILD_QUES : ch;

/**
 * Split a command line into tokens. Supports double quotes so arguments with
 * spaces survive (e.g. `touch "my notes.txt"`). Operators (`|`, `>`, `>>`) are
 * treated as ordinary text here — {@link parsePipeline} handles those.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let hasToken = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasToken = true;
      continue;
    }
    if (ch === " " && !inQuotes) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += shield(ch, inQuotes);
    hasToken = true;
  }
  if (hasToken) tokens.push(current);
  return tokens;
}

export interface Stage {
  name: string;
  args: string[];
}

export interface Redirect {
  file: string;
  append: boolean;
}

export interface Pipeline {
  stages: Stage[];
  redirect: Redirect | null;
}

export type ParseResult =
  | { ok: true; pipeline: Pipeline }
  | { ok: false; error: string };

/** Lex a line into tokens, emitting `|`, `>`, `>>` as their own operator tokens. */
function lex(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let hasToken = false;
  const flush = (): void => {
    if (hasToken) {
      tokens.push(current);
      current = "";
      hasToken = false;
    }
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasToken = true;
      continue;
    }
    if (!inQuotes) {
      if (ch === " ") {
        flush();
        continue;
      }
      if (ch === "|") {
        flush();
        tokens.push("|");
        continue;
      }
      if (ch === ">") {
        flush();
        if (line[i + 1] === ">") {
          tokens.push(">>");
          i++;
        } else {
          tokens.push(">");
        }
        continue;
      }
    }
    current += shield(ch, inQuotes);
    hasToken = true;
  }
  flush();
  return tokens;
}

/**
 * Parse a command line into a pipeline of stages plus an optional output
 * redirect. `cat notes.txt | grep todo > out.txt` becomes three... two stages
 * and a redirect. An empty line parses to zero stages.
 */
export function parsePipeline(line: string): ParseResult {
  const tokens = lex(line);
  const stages: Stage[] = [];
  let current: string[] = [];
  let redirect: Redirect | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "|") {
      if (current.length === 0) return { ok: false, error: "syntax error near '|'" };
      stages.push({ name: current[0], args: current.slice(1) });
      current = [];
    } else if (t === ">" || t === ">>") {
      const file = tokens[i + 1];
      if (!file || file === "|" || file === ">" || file === ">>") {
        return { ok: false, error: `syntax error: expected a filename after '${t}'` };
      }
      redirect = { file, append: t === ">>" };
      i++;
      if (i + 1 < tokens.length) {
        return { ok: false, error: "syntax error: unexpected text after redirect" };
      }
    } else {
      current.push(t);
    }
  }
  if (current.length > 0) {
    stages.push({ name: current[0], args: current.slice(1) });
  }
  if (redirect && stages.length === 0) {
    return { ok: false, error: "syntax error: redirect has no command" };
  }
  return { ok: true, pipeline: { stages, redirect } };
}

/** How a pipeline relates to the one before it. `null` = the first one. */
export type Connector = "&&" | "||" | ";";

export interface SequenceItem {
  connector: Connector | null;
  pipeline: Pipeline;
}

export type SequenceResult =
  | { ok: true; items: SequenceItem[] }
  | { ok: false; error: string };

/**
 * Split a line into pipeline segments at top-level `;`, `&&`, `||` (a single
 * `|` stays inside its pipeline). Quotes shield the operators. Each segment
 * carries the connector that preceded it.
 */
function splitSequence(line: string): { connector: Connector | null; text: string }[] {
  const segments: { connector: Connector | null; text: string }[] = [];
  let text = "";
  let connector: Connector | null = null;
  let inQuotes = false;
  const cut = (next: Connector): void => {
    segments.push({ connector, text });
    connector = next;
    text = "";
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      text += ch;
    } else if (inQuotes) {
      text += ch;
    } else if (ch === ";") {
      cut(";");
    } else if (ch === "&" && line[i + 1] === "&") {
      cut("&&");
      i++;
    } else if (ch === "|" && line[i + 1] === "|") {
      cut("||");
      i++;
    } else {
      text += ch;
    }
  }
  segments.push({ connector, text });
  return segments;
}

/**
 * Parse a full command line into a sequence of pipelines joined by `;`/`&&`/
 * `||`. A single pipeline (no operators) yields one item with a `null`
 * connector. A trailing `;` is allowed; an empty segment anywhere else — a
 * leading operator or `a && && b` — is a syntax error.
 */
export function parseSequence(line: string): SequenceResult {
  const segments = splitSequence(line);
  const items: SequenceItem[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.text.trim() === "") {
      // A trailing `;` leaves an empty final segment — that's fine; anything
      // else empty (leading operator, `&&` with nothing after) is an error.
      if (seg.connector === ";" && i === segments.length - 1) continue;
      return { ok: false, error: `syntax error near '${seg.connector ?? ""}'` };
    }
    const parsed = parsePipeline(seg.text);
    if (!parsed.ok) return parsed;
    items.push({ connector: seg.connector, pipeline: parsed.pipeline });
  }
  return { ok: true, items };
}
