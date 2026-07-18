import { VfsError } from "../vfs/vfs.js";
import type { Command, CommandContext } from "./registry.js";

/** Collect single-letter flags from args (`-in` → {i, n}). */
function flagsOf(args: string[]): Set<string> {
  const flags = new Set<string>();
  for (const arg of args) {
    if (arg.length > 1 && arg.startsWith("-")) {
      for (const ch of arg.slice(1)) flags.add(ch);
    }
  }
  return flags;
}

/** Read a file, or print a VfsError and return null. */
function readOrError(ctx: CommandContext, file: string): string | null {
  try {
    return ctx.vfs.readFile(ctx.vfs.resolve(ctx.cwd, file));
  } catch (err) {
    if (err instanceof VfsError) {
      ctx.error(err.message);
      return null;
    }
    throw err;
  }
}

/** The input sources for a filter command: named files, or piped stdin. */
function sourcesOf(
  ctx: CommandContext,
  files: string[],
): { name: string; text: string }[] {
  if (files.length === 0) return [{ name: "", text: ctx.stdin }];
  const out: { name: string; text: string }[] = [];
  for (const file of files) {
    const text = readOrError(ctx, file);
    if (text !== null) out.push({ name: file, text });
  }
  return out;
}

interface GrepOptions {
  ignoreCase: boolean;
  showLineNo: boolean;
  invert: boolean;
  /** Lines of trailing (`-A`) / leading (`-B`) context to show around a match. */
  after: number;
  before: number;
  positionals: string[];
  error?: string;
}

/**
 * Parse grep's args, GNU-style. Handles the value-bearing context flags
 * `-A`/`-B`/`-C` in both attached (`-A2`) and separated (`-A 2`) forms, mixed
 * into clusters (`-inA2`). `-C` sets both directions; an explicit `-A`/`-B`
 * wins over `-C` regardless of order. Unknown single-letter flags are ignored,
 * matching the previous lenient behaviour.
 */
function parseGrepArgs(args: string[]): GrepOptions {
  let ignoreCase = false;
  let showLineNo = false;
  let invert = false;
  let after: number | null = null;
  let before: number | null = null;
  let both: number | null = null;
  const positionals: string[] = [];

  const invalid = (): GrepOptions => ({
    ignoreCase,
    showLineNo,
    invert,
    after: 0,
    before: 0,
    positionals,
    error: "grep: invalid context length argument",
  });

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-" || !arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const ch = arg[j];
      if (ch === "i") ignoreCase = true;
      else if (ch === "n") showLineNo = true;
      else if (ch === "v") invert = true;
      else if (ch === "A" || ch === "B" || ch === "C") {
        // The count is the rest of this token, or the next token if none.
        let numStr = arg.slice(j + 1);
        if (numStr === "") numStr = args[++i] ?? "";
        const n = Number(numStr);
        if (numStr === "" || !Number.isInteger(n) || n < 0) return invalid();
        if (ch === "A") after = n;
        else if (ch === "B") before = n;
        else both = n;
        break; // consumed the remainder of this token as the count
      }
      // unknown flag: ignore, as before
    }
  }

  return {
    ignoreCase,
    showLineNo,
    invert,
    after: after ?? both ?? 0,
    before: before ?? both ?? 0,
    positionals,
  };
}

export const grep: Command = {
  name: "grep",
  help: "print lines matching a pattern (from files or piped input)",
  usage: "grep [-inv] [-A<n>] [-B<n>] [-C<n>] <pattern> [file...]",
  run(args, ctx) {
    const opts = parseGrepArgs(args);
    if (opts.error) return ctx.error(opts.error);
    const pattern = opts.positionals[0];
    if (pattern === undefined) return ctx.error("grep: specify a pattern");
    const files = opts.positionals.slice(1);
    const { ignoreCase, showLineNo, invert, after, before } = opts;

    let regex: RegExp | null = null;
    try {
      regex = new RegExp(pattern, ignoreCase ? "i" : "");
    } catch {
      regex = null; // invalid regex → fall back to a literal substring match
    }
    const literal = ignoreCase ? pattern.toLowerCase() : pattern;
    const hit = (line: string): boolean => {
      const found = regex
        ? regex.test(line)
        : (ignoreCase ? line.toLowerCase() : line).includes(literal);
      return invert ? !found : found;
    };

    const sources = sourcesOf(ctx, files);
    const withName = files.length > 1;
    const hasContext = after > 0 || before > 0;

    // A match line uses `:` after its name/number, a context line uses `-`,
    // the way real grep distinguishes the two.
    const format = (name: string, lineNo: number, line: string, match: boolean): string => {
      const sep = match ? ":" : "-";
      let out = line;
      if (showLineNo) out = `${lineNo}${sep}${out}`;
      if (withName) out = `${name}${sep}${out}`;
      return out;
    };

    let groupPrinted = false; // for the `--` separator between context groups
    for (const src of sources) {
      const lines = src.text.split("\n");
      const matches: number[] = [];
      lines.forEach((line, i) => {
        if (hit(line)) matches.push(i);
      });
      if (matches.length === 0) continue;

      if (!hasContext) {
        for (const i of matches) ctx.print(format(src.name, i + 1, lines[i], true));
        continue;
      }

      // Expand each match to its context window, merging windows that overlap
      // or touch so shared lines are printed once.
      const groups: Array<[number, number]> = [];
      for (const m of matches) {
        const start = Math.max(0, m - before);
        const end = Math.min(lines.length - 1, m + after);
        const last = groups[groups.length - 1];
        if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
        else groups.push([start, end]);
      }

      const matched = new Set(matches);
      for (const [start, end] of groups) {
        if (groupPrinted) ctx.print("--");
        for (let i = start; i <= end; i++) {
          ctx.print(format(src.name, i + 1, lines[i], matched.has(i)));
        }
        groupPrinted = true;
      }
    }
  },
};

/** Convert a shell glob (`*.md`) to an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

export const find: Command = {
  name: "find",
  help: "list files and directories recursively",
  usage: "find [path] [-name <glob>]",
  run(args, ctx) {
    let start = ".";
    let glob: string | null = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-name") {
        glob = args[i + 1] ?? null;
        i++;
      } else if (!args[i].startsWith("-")) {
        start = args[i];
      }
    }

    const abs = ctx.vfs.resolve(ctx.cwd, start);
    if (!ctx.vfs.getNode(abs)) return ctx.error(`find: no such path: ${abs}`);
    const re = glob ? globToRegExp(glob) : null;

    const walk = (path: string): void => {
      const node = ctx.vfs.getNode(path);
      if (!node) return;
      const name = path.split("/").pop() ?? "";
      if (!re || re.test(name)) ctx.print(path === "" ? "/" : path);
      if (node.type === "dir") {
        for (const child of ctx.vfs.list(path)) {
          walk(path === "/" ? `/${child.name}` : `${path}/${child.name}`);
        }
      }
    };
    walk(abs);
  },
};

export const wc: Command = {
  name: "wc",
  help: "count lines, words, and characters",
  usage: "wc [-lwc] [file...]",
  run(args, ctx) {
    const flags = flagsOf(args);
    const files = args.filter((a) => a === "-" || !a.startsWith("-"));
    const showL = flags.has("l");
    const showW = flags.has("w");
    const showC = flags.has("c");
    const all = !showL && !showW && !showC;

    for (const src of sourcesOf(ctx, files)) {
      const text = src.text;
      const lines =
        text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
      const words = text.split(/\s+/).filter(Boolean).length;
      const chars = text.length;

      const parts: number[] = [];
      if (showL || all) parts.push(lines);
      if (showW || all) parts.push(words);
      if (showC || all) parts.push(chars);
      const counts = parts.map((n) => String(n).padStart(4)).join(" ");
      ctx.print(src.name ? `${counts} ${src.name}` : counts.trimStart());
    }
  },
};

/** Split text into lines, dropping the single empty line a trailing newline
 * leaves behind (so `head`/`tail` count lines the way a real terminal does). */
function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

interface CountOptions {
  count: number;
  files: string[];
  error?: string;
}

/** Parse `head`/`tail` args: a line count via `-n <k>`, `-n<k>` or `-<k>`
 * (default 10), plus file operands. Unknown flags are ignored, like grep. */
function parseCount(args: string[]): CountOptions {
  let count = 10;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-" || !a.startsWith("-")) {
      files.push(a);
      continue;
    }
    let value: string | null = null;
    if (a === "-n") value = args[++i] ?? "";
    else if (a.startsWith("-n")) value = a.slice(2);
    else if (/^-\d+$/.test(a)) value = a.slice(1);
    if (value === null) continue; // some other flag → ignore
    const n = Number(value);
    if (value === "" || !Number.isInteger(n) || n < 0) {
      return { count, files, error: `invalid number of lines: '${value}'` };
    }
    count = n;
  }
  return { count, files };
}

/** Emit `pick`ed lines from each source, with `==> name <==` headers when more
 * than one file is named (the way GNU head/tail separate multiple files). */
function headTail(
  ctx: CommandContext,
  args: string[],
  name: string,
  pick: (lines: string[], count: number) => string[],
): void {
  const opts = parseCount(args);
  if (opts.error) return ctx.error(`${name}: ${opts.error}`);
  const withName = opts.files.length > 1;
  sourcesOf(ctx, opts.files).forEach((src, i) => {
    if (withName) {
      if (i > 0) ctx.print("");
      ctx.print(`==> ${src.name} <==`);
    }
    for (const line of pick(toLines(src.text), opts.count)) ctx.print(line);
  });
}

export const head: Command = {
  name: "head",
  help: "print the first lines of a file (or piped input)",
  usage: "head [-n <k>] [file...]",
  run(args, ctx) {
    headTail(ctx, args, "head", (lines, count) => lines.slice(0, count));
  },
};

export const tail: Command = {
  name: "tail",
  help: "print the last lines of a file (or piped input)",
  usage: "tail [-n <k>] [file...]",
  run(args, ctx) {
    headTail(ctx, args, "tail", (lines, count) =>
      count <= 0 ? [] : lines.slice(-count),
    );
  },
};

/** Gather every line across a command's sources (files and/or piped stdin). */
function allLines(ctx: CommandContext, files: string[]): string[] {
  const lines: string[] = [];
  for (const src of sourcesOf(ctx, files)) lines.push(...toLines(src.text));
  return lines;
}

export const sort: Command = {
  name: "sort",
  help: "sort lines of text",
  usage: "sort [-rnu] [file...]",
  run(args, ctx) {
    const flags = flagsOf(args);
    const files = args.filter((a) => a === "-" || !a.startsWith("-"));
    const numeric = flags.has("n");
    const compare = (a: string, b: string): number => {
      if (numeric) {
        const na = parseFloat(a);
        const nb = parseFloat(b);
        return (Number.isNaN(na) ? 0 : na) - (Number.isNaN(nb) ? 0 : nb);
      }
      return a < b ? -1 : a > b ? 1 : 0;
    };
    const lines = allLines(ctx, files);
    lines.sort(compare);
    if (flags.has("r")) lines.reverse();
    // -u keeps only the first line of each run that compares equal by the active
    // key, so `sort -nu` de-dupes numerically rather than by raw text.
    const out = flags.has("u")
      ? lines.filter((l, i) => i === 0 || compare(l, lines[i - 1]) !== 0)
      : lines;
    for (const line of out) ctx.print(line);
  },
};

export const uniq: Command = {
  name: "uniq",
  help: "collapse adjacent duplicate lines (needs sorted input)",
  usage: "uniq [-cd] [file...]",
  run(args, ctx) {
    const flags = flagsOf(args);
    const files = args.filter((a) => a === "-" || !a.startsWith("-"));
    const showCount = flags.has("c");
    const onlyDup = flags.has("d");
    const lines = allLines(ctx, files);
    for (let i = 0; i < lines.length; ) {
      let j = i + 1;
      while (j < lines.length && lines[j] === lines[i]) j++;
      const count = j - i;
      if (!onlyDup || count > 1) {
        ctx.print(showCount ? `${String(count).padStart(4)} ${lines[i]}` : lines[i]);
      }
      i = j;
    }
  },
};

/** Parse a cut list like `1,3`, `2-`, `-4`, `2-5` into 1-based [start,end] pairs
 * (end `null` = open-ended). Returns null on a malformed list. */
function parseRanges(spec: string): Array<[number, number | null]> | null {
  const ranges: Array<[number, number | null]> = [];
  for (const tok of spec.split(",")) {
    if (/^\d+$/.test(tok)) {
      const n = Number(tok);
      if (n < 1) return null;
      ranges.push([n, n]);
    } else if (/^\d+-$/.test(tok)) {
      const n = Number(tok.slice(0, -1));
      if (n < 1) return null;
      ranges.push([n, null]);
    } else if (/^-\d+$/.test(tok)) {
      const m = Number(tok.slice(1));
      if (m < 1) return null;
      ranges.push([1, m]);
    } else if (/^\d+-\d+$/.test(tok)) {
      const [a, b] = tok.split("-").map(Number);
      if (a < 1 || b < a) return null;
      ranges.push([a, b]);
    } else {
      return null;
    }
  }
  return ranges;
}

/** The 1-based positions a range list selects among `n` items, ascending and
 * de-duplicated — cut always emits in input order, never the list's order. */
function selectedPositions(ranges: Array<[number, number | null]>, n: number): number[] {
  const set = new Set<number>();
  for (const [a, b] of ranges) {
    const end = b === null ? n : Math.min(b, n);
    for (let k = a; k <= end; k++) set.add(k);
  }
  return [...set].sort((x, y) => x - y);
}

export const cut: Command = {
  name: "cut",
  help: "extract selected fields or characters from each line",
  usage: "cut -f <list> [-d <delim>] [file...] | cut -c <list> [file...]",
  run(args, ctx) {
    let delim = "\t";
    let fieldSpec: string | null = null;
    let charSpec: string | null = null;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-d") delim = args[++i] ?? "\t";
      else if (a.startsWith("-d") && a.length > 2) delim = a.slice(2);
      else if (a === "-f") fieldSpec = args[++i] ?? "";
      else if (a.startsWith("-f") && a.length > 2) fieldSpec = a.slice(2);
      else if (a === "-c") charSpec = args[++i] ?? "";
      else if (a.startsWith("-c") && a.length > 2) charSpec = a.slice(2);
      else if (a === "-" || !a.startsWith("-")) files.push(a);
    }
    if (fieldSpec !== null && charSpec !== null) {
      return ctx.error("cut: only one list type (-f or -c) may be specified");
    }
    if (fieldSpec === null && charSpec === null) {
      return ctx.error("cut: specify a list with -f (fields) or -c (characters)");
    }
    const ranges = parseRanges(fieldSpec ?? charSpec!);
    if (!ranges) return ctx.error("cut: invalid list");

    for (const src of sourcesOf(ctx, files)) {
      for (const line of toLines(src.text)) {
        if (charSpec !== null) {
          const chars = [...line];
          const pos = selectedPositions(ranges, chars.length);
          ctx.print(pos.map((k) => chars[k - 1]).join(""));
        } else if (!line.includes(delim)) {
          ctx.print(line); // no delimiter → whole line, like GNU cut without -s
        } else {
          const parts = line.split(delim);
          const pos = selectedPositions(ranges, parts.length);
          ctx.print(pos.map((k) => parts[k - 1]).join(delim));
        }
      }
    }
  },
};

export const textCommands: Command[] = [grep, find, wc, head, tail, sort, uniq, cut];
