import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { reverseLine, base64Encode, base64Decode, factorize, hexdump } from "./coreutils.js";

export { reverseLine, base64Encode, base64Decode, factorize, hexdump };

/**
 * Gather the input for a filter-style tool: the named files (read from the VFS,
 * concatenated) or, when no file is given, whatever was piped in. Returns null
 * after printing an error if a file can't be read.
 */
function gather(args: string[], ctx: CoreCommandContext): string | null {
  if (args.length === 0) return ctx.stdin;
  const parts: string[] = [];
  for (const arg of args) {
    try {
      parts.push(ctx.vfs.readFile(ctx.vfs.resolve(ctx.cwd, arg)));
    } catch (err) {
      ctx.error(err instanceof Error ? err.message : String(err));
      return null;
    }
  }
  // Concatenate byte-for-byte, like `cat` — inserting a separator would invent
  // a newline that's in neither file (corrupting a base64/xxd of the bytes, and
  // splitting a `rev` line that spans an unterminated file boundary).
  return parts.join("");
}

/**
 * `rev` — reverse the characters of each line. Unlike the byte-oriented tools,
 * `rev` processes each file (or stdin) independently, so a line never spans a
 * file boundary — matching the real `rev [file...]`.
 */
const rev: Command<CoreCommandContext> = {
  name: "rev",
  help: "reverse the characters of each line",
  usage: "rev [file...]   (or pipe text in)",
  run(args, ctx) {
    const revText = (text: string) => {
      if (text === "") return; // empty source → nothing (no spurious blank line)
      for (const line of text.split("\n")) ctx.print(reverseLine(line));
    };
    if (args.length === 0) return revText(ctx.stdin);
    for (const arg of args) {
      let content: string;
      try {
        content = ctx.vfs.readFile(ctx.vfs.resolve(ctx.cwd, arg));
      } catch (err) {
        ctx.error(err instanceof Error ? err.message : String(err));
        return;
      }
      revText(content);
    }
  },
};

/** `base64` — encode (default) or decode (`-d`) text. */
const base64: Command<CoreCommandContext> = {
  name: "base64",
  help: "base64-encode (or -d to decode) text",
  usage: "base64 [-d] [file]   (or pipe text in)",
  run(args, ctx) {
    const decode = args[0] === "-d" || args[0] === "--decode";
    const rest = decode ? args.slice(1) : args;
    const input = gather(rest, ctx);
    if (input === null) return;
    try {
      const out = decode ? base64Decode(input) : base64Encode(input);
      if (out === "") return; // empty in → empty out; a filter never invents output
      for (const line of out.split("\n")) ctx.print(line);
    } catch {
      ctx.error("base64: invalid input");
    }
  },
  complete(args) {
    return args.length === 0 ? ["-d"] : [];
  },
};

// Trial division stays snappy while sqrt(n) ≤ 10^6, so cap operands at 10^12.
// That keeps `factor` from freezing the (uninterruptible) main thread on a large
// prime — and never silently rounds, since 10^12 is well within safe integers.
const FACTOR_MAX = 1_000_000_000_000;

/** `factor` — print the prime factorisation of each number. */
const factor: Command<CoreCommandContext> = {
  name: "factor",
  help: "print the prime factors of a number",
  usage: "factor <number>...   (or pipe numbers in)",
  run(args, ctx) {
    const tokens = args.length > 0 ? args : ctx.stdin.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return; // empty input → nothing, like any filter
    for (const tok of tokens) {
      const n = Number(tok);
      if (!Number.isInteger(n) || n < 1) {
        ctx.error(`factor: '${tok}' is not a positive integer`);
        continue;
      }
      if (n > FACTOR_MAX) {
        ctx.error(`factor: '${tok}' is too large (max ${FACTOR_MAX})`);
        continue;
      }
      ctx.print(`${n}: ${factorize(n).join(" ")}`.trimEnd());
    }
  },
};

/** `xxd` — a canonical hex dump. */
const xxd: Command<CoreCommandContext> = {
  name: "xxd",
  help: "make a hex dump of text",
  usage: "xxd [file]   (or pipe text in)",
  run(args, ctx) {
    const input = gather(args, ctx);
    if (input === null) return;
    for (const line of hexdump(input)) ctx.print(line); // empty input → no output
  },
};

export const pkg: Package = {
  name: "coreutils",
  description: "small Unix text tools: rev, base64, factor, xxd",
  commands: [rev, base64, factor, xxd],
};
