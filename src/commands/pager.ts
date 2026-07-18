import { Pager } from "../apps/pager.js";
import { isFile } from "../vfs/types.js";
import type { Command, CommandContext } from "./registry.js";

async function page(name: string, args: string[], ctx: CommandContext): Promise<void> {
  const file = args.find((a) => a === "-" || !a.startsWith("-"));
  let title: string;
  let content: string;

  if (file && file !== "-") {
    const path = ctx.vfs.resolve(ctx.cwd, file);
    const node = ctx.vfs.getNode(path);
    if (!node) return ctx.error(`${name}: no such file: ${file}`);
    if (!isFile(node)) return ctx.error(`${name}: is a directory: ${file}`);
    content = node.content;
    title = file;
  } else {
    content = ctx.stdin;
    title = "(stdin)";
  }

  // A screen app can't take over the screen mid-pipeline, so when captured
  // (e.g. `less foo | grep x`) just pass the content straight through.
  if (ctx.piped) {
    for (const line of content.split("\n")) ctx.print(line);
    return;
  }

  await ctx.runApp((exit) => new Pager(title, content, exit));
}

export const less: Command = {
  name: "less",
  help: "page through a file or piped input",
  usage: "less [file]",
  aliases: ["more"],
  run: (args, ctx) => page("less", args, ctx),
};

export const pagerCommands: Command[] = [less];
