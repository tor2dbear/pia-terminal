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
  return parts.join("\n");
}

/** `rev` — reverse the characters of each line. */
const rev: Command<CoreCommandContext> = {
  name: "rev",
  help: "reverse the characters of each line",
  usage: "rev [file...]   (or pipe text in)",
  run(args, ctx) {
    const input = gather(args, ctx);
    if (input === null) return;
    if (input === "" && args.length === 0) return; // nothing to do
    for (const line of input.split("\n")) ctx.print(reverseLine(line));
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
    if (input === "" && rest.length === 0) return ctx.print("usage: base64 [-d] [file]");
    try {
      const out = decode ? base64Decode(input) : base64Encode(input);
      for (const line of out.split("\n")) ctx.print(line);
    } catch {
      ctx.error("base64: invalid input");
    }
  },
  complete(args) {
    return args.length === 0 ? ["-d"] : [];
  },
};

/** `factor` — print the prime factorisation of each number. */
const factor: Command<CoreCommandContext> = {
  name: "factor",
  help: "print the prime factors of a number",
  usage: "factor <number>...   (or pipe numbers in)",
  run(args, ctx) {
    const tokens = args.length > 0 ? args : ctx.stdin.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return ctx.print("usage: factor <number>...");
    for (const tok of tokens) {
      const n = Number(tok);
      if (!Number.isInteger(n) || n < 1) {
        ctx.error(`factor: '${tok}' is not a positive integer`);
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
    if (input === "" && args.length === 0) return ctx.print("usage: xxd [file]");
    for (const line of hexdump(input)) ctx.print(line);
  },
};

export const pkg: Package = {
  name: "coreutils",
  description: "small Unix text tools: rev, base64, factor, xxd",
  commands: [rev, base64, factor, xxd],
};
