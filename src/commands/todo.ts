import { Todo } from "../apps/todo.js";
import { isFile } from "../vfs/types.js";
import type { Command } from "./registry.js";

export const todo: Command = {
  name: "todo",
  help: "manage a checklist (stored as a shareable .list file)",
  usage: "todo [file]",
  async run(args, ctx) {
    const name = args[0] ?? "todo.list";
    const path = ctx.vfs.resolve(ctx.cwd, name);
    const node = ctx.vfs.getNode(path);
    if (node && !isFile(node)) return ctx.error(`is a directory: ${path}`);
    const content = node && isFile(node) ? node.content : "";

    await ctx.runApp(
      (exit) =>
        new Todo(
          name,
          content,
          async (text) => {
            ctx.vfs.writeFile(path, text);
            await ctx.persist();
          },
          exit,
        ),
    );
  },
};

export const todoCommands: Command[] = [todo];
