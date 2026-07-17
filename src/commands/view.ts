import { VfsError } from "../vfs/vfs.js";
import { renderJson } from "../pia/json.js";
import { formatColumns } from "../pia/table.js";
import type { Command, CommandContext } from "./registry.js";

/** Read a file argument, or piped stdin, or report a usage error. */
function readInput(ctx: CommandContext, files: string[], usage: string): string | null {
  if (files.length > 0) {
    const parts: string[] = [];
    for (const f of files) {
      try {
        parts.push(ctx.vfs.readFile(ctx.vfs.resolve(ctx.cwd, f)));
      } catch (err) {
        ctx.error(err instanceof VfsError ? `${usage.split(":")[0]}: ${err.message}` : String(err));
        return null;
      }
    }
    return parts.join("\n");
  }
  if (ctx.stdin) return ctx.stdin;
  ctx.error(usage);
  return null;
}

export const jsonPp: Command = {
  name: "json_pp",
  help: "pretty-print and colourise a JSON file",
  usage: "json_pp <file.json>",
  aliases: ["json"],
  run(args, ctx) {
    const files = args.filter((a) => !a.startsWith("-"));
    const src = readInput(ctx, files, "json_pp: usage — json_pp <file.json>");
    if (src === null) return;
    try {
      for (const { text, cls } of renderJson(src)) ctx.print(text, cls);
    } catch (err) {
      ctx.error(`json_pp: invalid JSON${err instanceof Error ? `: ${err.message}` : ""}`);
    }
  },
};

export const column: Command = {
  name: "column",
  help: "format delimited text into a table (column -t [-s sep])",
  usage: "column -t [-s sep] <file>",
  run(args, ctx) {
    let sep: string | undefined;
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-s") sep = args[++i] ?? "";
      else if (a.startsWith("-s")) sep = a.slice(2);
      else if (a.startsWith("-")) continue; // -t (table) and any other flag
      else files.push(a);
    }
    const src = readInput(ctx, files, "column: usage — column -t [-s sep] <file>");
    if (src === null) return;
    for (const line of formatColumns(src.split("\n"), sep)) ctx.print(line);
  },
};

export const viewCommands: Command[] = [jsonPp, column];
