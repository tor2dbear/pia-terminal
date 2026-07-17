import { VfsError } from "../vfs/vfs.js";
import { renderMarkdown } from "../pia/markdown.js";
import type { Command } from "./registry.js";

export const glow: Command = {
  name: "glow",
  help: "render a Markdown file (headings, lists, quotes) in the terminal",
  usage: "glow <file.md>",
  aliases: ["md"],
  run(args, ctx) {
    const file = args.find((a) => !a.startsWith("-"));
    let content: string;
    if (file) {
      const target = ctx.vfs.resolve(ctx.cwd, file);
      try {
        content = ctx.vfs.readFile(target);
      } catch (err) {
        ctx.error(err instanceof VfsError ? `glow: ${err.message}` : String(err));
        return;
      }
    } else if (ctx.stdin) {
      content = ctx.stdin;
    } else {
      ctx.error("glow: usage — glow <file.md>");
      return;
    }
    for (const { text, cls } of renderMarkdown(content)) ctx.print(text, cls);
  },
};

export const glowCommands: Command[] = [glow];
