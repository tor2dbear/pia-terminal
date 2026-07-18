import { encodeShare, MAX_SHARE_BYTES } from "../share/share.js";
import { kindOf } from "../share/kind.js";
import { isDir, isFile } from "../vfs/types.js";
import { folderLink } from "./publish.js";
import { Todo } from "../apps/todo.js";
import { Editor } from "../apps/editor.js";
import type { Command, CommandContext } from "./registry.js";
import type { SharedList } from "../share/store.js";

export { kindOf };

export const share: Command = {
  name: "share",
  help: "share a file or folder as a read-only link, or `share <file> <email>` to co-edit",
  usage: "share <file|folder> [email]",
  async run(args, ctx) {
    const [name, email] = args;
    if (!name) return ctx.error("share: specify a file or folder");

    const node = ctx.vfs.getNode(ctx.vfs.resolve(ctx.cwd, name));
    // A folder shares as a link only (co-editing is a per-file thing).
    if (node && isDir(node)) {
      if (email) {
        return ctx.error("share: can't co-edit a folder — share a single file for that");
      }
      const result = folderLink(ctx, name);
      if ("error" in result) return ctx.error(`share: ${result.error}`);
      ctx.print("public link (read-only):", "dim");
      ctx.print(result.url, "accent");
      return;
    }

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

    // Hide the ones already placed in the tree (they show up in `ls`); `shared`
    // is the inbox of memberships you haven't put anywhere yet.
    const linked = ctx.vfs.linkedShareIds();
    const incoming = items.filter((i) => !linked.has(i.id));

    if (!args[0]) {
      if (incoming.length === 0) {
        ctx.print("nothing new shared with you", "dim");
        ctx.print("shared files you've placed show up in `ls` (marked @)", "dim");
        return;
      }
      ctx.print("shared with you (not yet placed):", "dim");
      for (const item of incoming) {
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

/**
 * `share <file> <email>` — share a file for co-editing and invite someone. The
 * file stays exactly where it is; it just gains a cloud link (its content
 * becomes a synced cache). Sharing is a property, not a move.
 */
export async function shareForEditing(
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

  try {
    if (node.shareId) {
      // Already shared — add another member to the existing link.
      await ctx.share.invite(node.shareId, email);
    } else {
      const id = await ctx.share.create(node.name, node.content);
      ctx.vfs.link(path, id); // link in place — no move
      await ctx.share.invite(id, email);
      await ctx.persist();
    }

    ctx.print(`shared "${node.name}" with ${email}`, "accent");
    const emailed = await notifyInvitee(email, ctx);
    ctx.print(
      emailed
        ? "sent them an invite link — clicking it signs them in"
        : "they'll see it under `shared` once they log in",
      "dim",
    );
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
  await ctx.runApp(
    (exit) => new Editor([{ filename: `${item.name}  👥`, content, onSave: save }], exit),
  );
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
