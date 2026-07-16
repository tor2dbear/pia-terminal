import { Todo } from "../apps/todo.js";
import { isFile } from "../vfs/types.js";
import type { Command, CommandContext } from "./registry.js";

/** All todo lists live here, under the current user's home. */
function listsDir(ctx: CommandContext): string {
  return `${ctx.vfs.home}/todo`;
}

/** Count open vs. done items in a `.list` file's content. */
function counts(content: string): { open: number; done: number } {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  const done = lines.filter((l) => /^\[x\]/i.test(l.trim())).length;
  return { open: lines.length - done, done };
}

export const todo: Command = {
  name: "todo",
  help: "manage checklists (in ~/todo/); no name lists them",
  usage: "todo [name]",
  async run(args, ctx) {
    const dir = listsDir(ctx);

    // No argument: show the available lists.
    if (!args[0]) {
      const node = ctx.vfs.getNode(dir);
      const files =
        node && node.type === "dir"
          ? ctx.vfs.list(dir).filter((n) => n.type === "file")
          : [];
      if (files.length === 0) {
        ctx.print("no lists yet — `todo <name>` to start one", "dim");
        return;
      }
      ctx.print("your lists:", "dim");
      for (const file of files) {
        const c = counts(ctx.vfs.readFile(`${dir}/${file.name}`));
        const name = file.name.replace(/\.list$/, "");
        ctx.print(`  ${name.padEnd(16)} ${c.open} open · ${c.done} done`);
      }
      return;
    }

    // A name: open (or create) that list. `.list` is implied.
    const filename = args[0].endsWith(".list") ? args[0] : `${args[0]}.list`;
    const path = `${dir}/${filename}`;
    const existing = ctx.vfs.getNode(path);
    if (existing && !isFile(existing)) {
      return ctx.error(`is a directory: ${path}`);
    }
    ctx.vfs.mkdirp(dir);
    const content = existing && isFile(existing) ? existing.content : "";

    await ctx.runApp(
      (exit) =>
        new Todo(
          filename.replace(/\.list$/, ""),
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
