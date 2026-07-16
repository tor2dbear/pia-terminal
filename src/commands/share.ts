import { encodeShare, MAX_SHARE_BYTES } from "../share/share.js";
import { isFile } from "../vfs/types.js";
import { Todo } from "../apps/todo.js";
import { Editor } from "../apps/editor.js";
import type { Command, CommandContext } from "./registry.js";
import type { SharedList } from "../share/store.js";

/**
 * Which app opens a shared item. Driven by the filename extension, with a
 * content sniff so legacy checklists stored without a `.list` suffix still open
 * in the todo app rather than the text editor.
 */
export function kindOf(name: string, content: string): "list" | "text" {
  if (/\.list$/i.test(name)) return "list";
  const hasExtension = /\.[a-z0-9]+$/i.test(name);
  const looksLikeChecklist = content
    .split("\n")
    .some((line) => /^\s*\[[ xX]\]/.test(line));
  return !hasExtension && looksLikeChecklist ? "list" : "text";
}

export const share: Command = {
  name: "share",
  help: "share a file: a read-only link, or `share <file> <email>` to co-edit",
  usage: "share <file> [email]",
  async run(args, ctx) {
    const [name, email] = args;
    if (!name) return ctx.error("share: specify a file");
    return email ? shareForEditing(name, email, ctx) : shareAsLink(name, ctx);
  },
};

export const shared: Command = {
  name: "shared",
  help: "list and open files shared with you (co-edited)",
  usage: "shared [name]",
  async run(args, ctx) {
    if (!ctx.share?.available()) {
      return ctx.error("shared: sharing needs an account — run `login` first");
    }
    let items: SharedList[];
    try {
      items = await ctx.share.mine();
    } catch {
      return ctx.error("shared: could not reach the cloud");
    }

    if (!args[0]) {
      if (items.length === 0) {
        ctx.print("nothing shared with you yet", "dim");
        ctx.print("`share <file> <email>` to share one", "dim");
        return;
      }
      ctx.print("shared with you:", "dim");
      for (const item of items) {
        const tag = kindOf(item.name, item.content) === "list" ? "list" : "file";
        ctx.print(`  ${item.name.padEnd(20)} ${tag}  👥`);
      }
      return;
    }

    const item = items.find(
      (i) => i.name === args[0] || i.name.replace(/\.list$/, "") === args[0],
    );
    if (!item) return ctx.error(`shared: no such shared item: ${args[0]}`);
    return openSharedItem(item, ctx);
  },
};

/** `share <file>` — pack the file into a self-contained public read-only URL. */
async function shareAsLink(name: string, ctx: CommandContext): Promise<void> {
  const path = ctx.vfs.resolve(ctx.cwd, name);
  const node = ctx.vfs.getNode(path);
  if (!node) return ctx.error(`share: no such file: ${path}`);
  if (!isFile(node)) return ctx.error(`share: not a file: ${path}`);

  const bytes = new TextEncoder().encode(node.content).length;
  if (bytes > MAX_SHARE_BYTES) {
    return ctx.error(`share: file too large to link (max ${MAX_SHARE_BYTES} bytes)`);
  }
  const payload = encodeShare({ name: node.name, content: node.content });
  ctx.print("public link (read-only):", "dim");
  ctx.print(`${ctx.baseUrl}#s=${payload}`, "accent");
}

/** `share <file> <email>` — promote a file to a cloud-shared item and invite. */
async function shareForEditing(
  name: string,
  email: string,
  ctx: CommandContext,
): Promise<void> {
  if (!ctx.share?.available()) {
    return ctx.error("share: co-editing needs an account — run `login` first");
  }
  const path = ctx.vfs.resolve(ctx.cwd, name);
  const node = ctx.vfs.getNode(path);
  if (!node || !isFile(node)) return ctx.error(`share: no such file: ${path}`);
  const filename = node.name; // basename, with extension — drives which app opens it

  try {
    // Already shared? Just add another person. Otherwise promote it and hand the
    // local copy over to the cloud (one source of truth).
    const already = (await ctx.share.mine()).find((i) => i.name === filename);
    let id: string;
    if (already) {
      id = already.id;
      await ctx.share.invite(id, email);
    } else {
      id = await ctx.share.create(filename, node.content);
      await ctx.share.invite(id, email);
      ctx.vfs.remove(path);
      await ctx.persist();
    }

    ctx.print(`shared "${filename}" with ${email}`, "accent");
    const emailed = await notifyInvitee(email, ctx);
    ctx.print(
      emailed
        ? "sent them an invite link — clicking it signs them in"
        : "they'll see it under `shared` once they log in",
      "dim",
    );
    ctx.print(`open it with \`shared ${filename}\``, "dim");
  } catch (e) {
    ctx.error(e instanceof Error ? e.message : "share failed");
  }
}

/** Open a shared item in the right app, saving edits back to the cloud. */
async function openSharedItem(item: SharedList, ctx: CommandContext): Promise<void> {
  let content = item.content;
  try {
    const fresh = await ctx.share?.get(item.id);
    if (fresh) content = fresh.content;
  } catch {
    /* fall back to the cached copy */
  }
  const save = async (text: string): Promise<void> => {
    await ctx.share?.save(item.id, text);
  };

  if (kindOf(item.name, content) === "list") {
    // A checklist merges cleanly, so it live-syncs a co-editor's change in place.
    let app: Todo | undefined;
    const unsubscribe = ctx.share?.subscribe?.(item.id, (next) =>
      app?.applyExternal(next),
    );
    try {
      await ctx.runApp(
        (exit) => (app = new Todo(`${item.name}  👥`, content, save, exit)),
      );
    } finally {
      unsubscribe?.();
    }
    return;
  }

  // Free text opens in the editor. No live-replace while editing — it would
  // clobber the other person's in-progress typing (last save wins instead).
  await ctx.runApp((exit) => new Editor(`${item.name}  👥`, content, save, exit));
}

/** Best-effort magic-link email; never throws (email is a nudge, not the seam). */
async function notifyInvitee(email: string, ctx: CommandContext): Promise<boolean> {
  if (!ctx.auth.inviteByEmail) return false;
  try {
    await ctx.auth.inviteByEmail(email, ctx.baseUrl);
    return true;
  } catch {
    return false;
  }
}

export const shareCommands: Command[] = [share, shared];
