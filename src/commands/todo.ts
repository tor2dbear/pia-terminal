import { Todo } from "../apps/todo.js";
import { isFile } from "../vfs/types.js";
import type { Command, CommandContext } from "./registry.js";
import type { SharedList } from "../share/store.js";

/** All local todo lists live here, under the current user's home. */
function listsDir(ctx: CommandContext): string {
  return `${ctx.vfs.home}/todo`;
}

/** Count open vs. done items in a `.list` file's content. */
function counts(content: string): { open: number; done: number } {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  const done = lines.filter((l) => /^\[x\]/i.test(l.trim())).length;
  return { open: lines.length - done, done };
}

/** Names (without `.list`) of the local lists in ~/todo/. */
function localLists(ctx: CommandContext): string[] {
  const dir = listsDir(ctx);
  const node = ctx.vfs.getNode(dir);
  if (!node || node.type !== "dir") return [];
  return ctx.vfs
    .list(dir)
    .filter((n) => n.type === "file")
    .map((n) => n.name.replace(/\.list$/, ""));
}

/** Shared lists for the current user — empty (never throws) if sharing is off. */
async function sharedLists(ctx: CommandContext): Promise<SharedList[]> {
  if (!ctx.share?.available()) return [];
  try {
    return await ctx.share.mine();
  } catch {
    return []; // offline / transient — fall back to just the local lists
  }
}

export const todo: Command = {
  name: "todo",
  help: "manage checklists (in ~/todo/); share them to collaborate",
  usage: "todo [name] | todo share <name> <email>",
  async run(args, ctx) {
    if (args[0] === "share") return shareList(args.slice(1), ctx);
    if (!args[0]) return listAll(ctx);

    // Open by name. A shared list wins over a local file of the same name, so a
    // list promoted to shared keeps opening the shared copy.
    const name = args[0].replace(/\.list$/, "");
    const shared = (await sharedLists(ctx)).find((l) => l.name === name);
    return shared ? openShared(shared, ctx) : openLocal(name, ctx);
  },
};

/** No argument: local lists, then any shared with you. */
async function listAll(ctx: CommandContext): Promise<void> {
  const locals = localLists(ctx);
  const shared = await sharedLists(ctx);
  if (locals.length === 0 && shared.length === 0) {
    ctx.print("no lists yet — `todo <name>` to start one", "dim");
    return;
  }
  if (locals.length > 0) {
    ctx.print("your lists:", "dim");
    for (const name of locals) {
      const c = counts(ctx.vfs.readFile(`${listsDir(ctx)}/${name}.list`));
      ctx.print(`  ${name.padEnd(16)} ${c.open} open · ${c.done} done`);
    }
  }
  if (shared.length > 0) {
    ctx.print("shared with you:", "dim");
    for (const list of shared) {
      const c = counts(list.content);
      ctx.print(`  ${list.name.padEnd(16)} ${c.open} open · ${c.done} done  👥`);
    }
  }
}

/** Open (or create) a local ~/todo/<name>.list. */
async function openLocal(name: string, ctx: CommandContext): Promise<void> {
  const path = `${listsDir(ctx)}/${name}.list`;
  const existing = ctx.vfs.getNode(path);
  if (existing && !isFile(existing)) return ctx.error(`is a directory: ${path}`);
  ctx.vfs.mkdirp(listsDir(ctx));
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

/** Open a shared list, saving edits back to the cloud. */
async function openShared(list: SharedList, ctx: CommandContext): Promise<void> {
  // Pull the freshest copy first so a co-editor's changes aren't clobbered on
  // the very next save. (Still last-write-wins during a session — good enough
  // for a shopping list; live sync is a later step.)
  let content = list.content;
  try {
    const fresh = await ctx.share?.get(list.id);
    if (fresh) content = fresh.content;
  } catch {
    /* use the cached copy */
  }

  await ctx.runApp(
    (exit) =>
      new Todo(
        `${list.name}  👥`,
        content,
        async (text) => {
          await ctx.share?.save(list.id, text);
        },
        exit,
      ),
  );
}

/** `todo share <name> <email>` — promote a list to shared and invite someone. */
async function shareList(args: string[], ctx: CommandContext): Promise<void> {
  const [name, email] = args;
  if (!name || !email) return ctx.error("usage: todo share <name> <email>");
  if (!ctx.share?.available()) {
    return ctx.error("sharing needs an account — run `login` first");
  }

  try {
    // Already shared? Just add another person.
    const already = (await ctx.share.mine()).find((l) => l.name === name);
    if (already) {
      await ctx.share.invite(already.id, email);
      ctx.print(`invited ${email} to "${name}"`, "accent");
      return;
    }

    // Promote a local list to a shared one, then hand the local copy over.
    const path = `${listsDir(ctx)}/${name}.list`;
    const node = ctx.vfs.getNode(path);
    if (!node || !isFile(node)) {
      return ctx.error(`no such list: ${name} — \`todo ${name}\` to create it first`);
    }
    const id = await ctx.share.create(name, node.content);
    await ctx.share.invite(id, email);
    ctx.vfs.remove(path); // now lives in the cloud — one source of truth
    await ctx.persist();
    ctx.print(`shared "${name}" with ${email}`, "accent");
    ctx.print("they'll see it under `todo` once they log in", "dim");
  } catch (e) {
    ctx.error(e instanceof Error ? e.message : "sharing failed");
  }
}

export const todoCommands: Command[] = [todo];
