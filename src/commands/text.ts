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

export const grep: Command = {
  name: "grep",
  help: "print lines matching a pattern (from files or piped input)",
  usage: "grep [-inv] <pattern> [file...]",
  run(args, ctx) {
    const flags = flagsOf(args);
    const rest = args.filter((a) => a === "-" || !a.startsWith("-"));
    const pattern = rest[0];
    if (pattern === undefined) return ctx.error("grep: specify a pattern");
    const files = rest.slice(1);

    const ignoreCase = flags.has("i");
    const showLineNo = flags.has("n");
    const invert = flags.has("v");

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
    for (const src of sources) {
      src.text.split("\n").forEach((line, i) => {
        if (!hit(line)) return;
        let out = line;
        if (showLineNo) out = `${i + 1}:${out}`;
        if (withName) out = `${src.name}:${out}`;
        ctx.print(out);
      });
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

export const textCommands: Command[] = [grep, find, wc];
