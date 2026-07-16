import { Todo } from "../apps/todo.js";
import { isFile, type FileNode } from "../vfs/types.js";
import { linkedContent, linkedSave, linkedSubscribe } from "./linked.js";
import { shareForEditing } from "./share.js";
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
  help: "manage checklists (in ~/todo/); share them to collaborate",
  usage: "todo [name] | todo share <name> <email>",
  async run(args, ctx) {
    if (args[0] === "share") return shareList(args.slice(1), ctx);
    if (!args[0]) return listLocal(ctx);
    return openList(args[0].replace(/\.list$/, ""), ctx);
  },
};

/** No argument: the lists in ~/todo/, marking the shared ones. */
function listLocal(ctx: CommandContext): void {
  const dir = listsDir(ctx);
  const node = ctx.vfs.getNode(dir);
  const files =
    node && node.type === "dir"
      ? ctx.vfs.list(dir).filter((n): n is FileNode => isFile(n))
      : [];
  if (files.length === 0) {
    ctx.print("no lists yet — `todo <name>` to start one", "dim");
    return;
  }
  ctx.print("your lists:", "dim");
  for (const file of files) {
    const name = file.name.replace(/\.list$/, "");
    const c = counts(file.content);
    const shared = file.shareId ? "  👥" : "";
    ctx.print(`  ${name.padEnd(16)} ${c.open} open · ${c.done} done${shared}`);
  }
}

/** Open (or create) ~/todo/<name>.list — through the cloud if it's shared. */
async function openList(name: string, ctx: CommandContext): Promise<void> {
  const path = `${listsDir(ctx)}/${name}.list`;
  const existing = ctx.vfs.getNode(path);
  if (existing && !isFile(existing)) return ctx.error(`is a directory: ${path}`);
  ctx.vfs.mkdirp(listsDir(ctx));

  if (existing && isFile(existing) && existing.shareId) {
    const id = existing.shareId;
    const content = await linkedContent(ctx, id, existing.content);
    const save = linkedSave(ctx, path, id);
    let app: Todo | undefined;
    const unsubscribe = linkedSubscribe(ctx, id, (next) => app?.applyExternal(next));
    try {
      await ctx.runApp(
        (exit) => (app = new Todo(`${name}  👥`, content, save, exit)),
      );
    } finally {
      unsubscribe?.();
    }
    return;
  }

  const content = existing && isFile(existing) ? existing.content : "";
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
}

/** `todo share <name> <email>` — share a list (in place) and invite someone. */
async function shareList(args: string[], ctx: CommandContext): Promise<void> {
  const [name, email] = args;
  if (!name || !email) return ctx.error("usage: todo share <name> <email>");
  const path = `${listsDir(ctx)}/${name}.list`;
  const node = ctx.vfs.getNode(path);
  if (!node || !isFile(node)) {
    return ctx.error(`no such list: ${name} — \`todo ${name}\` to create it first`);
  }
  return shareForEditing(path, email, ctx);
}

export const todoCommands: Command[] = [todo];
