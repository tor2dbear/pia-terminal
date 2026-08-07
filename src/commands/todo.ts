import { Todo } from "../apps/todo.js";
import { isFile, type FileNode } from "../vfs/types.js";
import { linkedContent, linkedSave, linkedSubscribe } from "./linked.js";
import { shareForEditing } from "./share.js";
import type { Command, CommandContext } from "./registry.js";
import type { InviteRole, Role } from "../share/store.js";

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
  usage: "todo [name] | todo share <name> <email> [--ro|--rw] | todo members <name> | todo unshare <name> <email>",
  async run(args, ctx) {
    if (args[0] === "share") return shareList(args.slice(1), ctx);
    if (args[0] === "members") return listMembers(args.slice(1), ctx);
    if (args[0] === "unshare") return unshareList(args.slice(1), ctx);
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

/** The caller's own role on a linked list (via the share backend), or undefined
 * (offline, guest, or not a member) — so opening a viewer-role list is read-only. */
async function roleFor(ctx: CommandContext, shareId: string): Promise<Role | undefined> {
  try {
    const lists = await ctx.share?.mine();
    return lists?.find((l) => l.id === shareId)?.role;
  } catch {
    return undefined; // offline/transient — treat as editable, the server still gates
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
    const readOnly = (await roleFor(ctx, id)) === "viewer";
    const save = readOnly ? async () => {} : linkedSave(ctx, path, id);
    let app: Todo | undefined;
    const unsubscribe = linkedSubscribe(ctx, id, (next) => app?.applyExternal(next));
    try {
      await ctx.runApp(
        (exit) => (app = new Todo(`${name}  👥`, content, save, exit, readOnly)),
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

/** Resolve a local list name to its file, or print an error and return null. */
function requireList(name: string | undefined, ctx: CommandContext): FileNode | null {
  if (!name) {
    ctx.error("usage: todo <name>");
    return null;
  }
  const path = `${listsDir(ctx)}/${name}.list`;
  const node = ctx.vfs.getNode(path);
  if (!node || !isFile(node)) {
    ctx.error(`no such list: ${name} — \`todo ${name}\` to create it first`);
    return null;
  }
  return node;
}

/** `todo share <name> <email> [--ro|--rw]` — share a list and invite someone,
 * as a viewer (`--ro`, read-only) or an editor (`--rw`, the default). */
async function shareList(args: string[], ctx: CommandContext): Promise<void> {
  let role: InviteRole = "editor";
  const rest: string[] = [];
  for (const a of args) {
    if (a === "--ro" || a === "--read-only") role = "viewer";
    else if (a === "--rw") role = "editor";
    else rest.push(a);
  }
  const [name, email] = rest;
  if (!name || !email) {
    return ctx.error("usage: todo share <name> <email> [--ro|--rw]");
  }
  if (!requireList(name, ctx)) return;
  // Pass the list's full path — shareForEditing resolves relative to cwd.
  return shareForEditing(`${listsDir(ctx)}/${name}.list`, email, ctx, role);
}

/** `todo members <name>` — who's on a shared list, and as what. */
async function listMembers(args: string[], ctx: CommandContext): Promise<void> {
  const node = requireList(args[0], ctx);
  if (!node) return;
  if (!node.shareId) return ctx.error(`not shared: ${args[0]} — \`todo share ${args[0]} <email>\` first`);
  if (!ctx.share?.available()) {
    return ctx.error("todo: sharing needs an account — run `login` first");
  }
  let members;
  try {
    members = await ctx.share.members(node.shareId);
  } catch (e) {
    return ctx.error(e instanceof Error ? e.message : "todo: could not reach the cloud");
  }
  if (members.length === 0) return ctx.print("no members", "dim");
  // owner first, then editors, then viewers; a stable, readable order.
  const rank: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 };
  members.sort((a, b) => rank[a.role] - rank[b.role] || a.email.localeCompare(b.email));
  ctx.print(`members of ${args[0]}:`, "dim");
  for (const m of members) {
    const pending = m.status === "invited" ? "  (invited)" : "";
    ctx.print(`  ${m.role.padEnd(6)}  ${m.email}${pending}`);
  }
}

/** `todo unshare <name> <email>` — remove a member (owner only). */
async function unshareList(args: string[], ctx: CommandContext): Promise<void> {
  const [name, email] = args;
  if (!name || !email) return ctx.error("usage: todo unshare <name> <email>");
  const node = requireList(name, ctx);
  if (!node) return;
  if (!node.shareId) return ctx.error(`not shared: ${name}`);
  if (!ctx.share?.available()) {
    return ctx.error("todo: sharing needs an account — run `login` first");
  }
  try {
    await ctx.share.removeMember(node.shareId, email);
    ctx.print(`removed ${email} from "${name}"`, "accent");
  } catch (e) {
    ctx.error(e instanceof Error ? e.message : "todo: could not update members");
  }
}

export const todoCommands: Command[] = [todo];
