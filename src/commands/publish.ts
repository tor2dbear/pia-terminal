import { isDir, isFile } from "../vfs/types.js";
import {
  encodePublish,
  MAX_PUBLISH_PAYLOAD,
  type PublishedPage,
} from "../share/publish.js";
import type { Command, CommandContext } from "./registry.js";

/**
 * Collect a folder's top-level files as publishable pages. `index.md` /
 * `README.md` lead (like a home page), the rest follow alphabetically.
 * Subfolders are left out — one flat set keeps the model (and the URL) simple.
 * All files count, not just Markdown: opening the link drops them into the
 * recipient's `~/incoming`, where `cat`/`glow` read whatever they are.
 */
export function collectFolderPages(ctx: CommandContext, dirAbs: string): PublishedPage[] {
  const rank = (name: string): number => {
    const lower = name.toLowerCase();
    return lower === "index.md" ? 0 : lower === "readme.md" ? 1 : 2;
  };
  return ctx.vfs
    .list(dirAbs)
    .filter((entry) => entry.type === "file")
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .map((entry) => {
      const fileNode = ctx.vfs.getNode(ctx.vfs.resolve(dirAbs, entry.name));
      return {
        name: entry.name,
        content: fileNode && isFile(fileNode) ? fileNode.content : "",
      };
    });
}

/**
 * Turn a folder into a shareable `#p=` link, or return a reason it can't. Shared
 * by `publish` and `share <folder>` so both build the exact same link.
 */
export function folderLink(
  ctx: CommandContext,
  name: string,
): { url: string; count: number } | { error: string } {
  const dir = ctx.vfs.resolve(ctx.cwd, name);
  const node = ctx.vfs.getNode(dir);
  if (!node) return { error: `no such directory: ${name}` };
  if (!isDir(node)) return { error: `not a directory: ${name}` };

  const pages = collectFolderPages(ctx, dir);
  if (pages.length === 0) return { error: `no files in ${name}` };

  const title = dir.split("/").filter(Boolean).pop() ?? "folder";
  const payload = encodePublish({ title, pages });
  if (payload.length > MAX_PUBLISH_PAYLOAD) {
    return {
      error:
        `${name} is too large to fit in a link ` +
        `(${Math.round(payload.length / 1024)} KB > ${Math.round(MAX_PUBLISH_PAYLOAD / 1024)} KB). ` +
        "Share a smaller folder or fewer files.",
    };
  }
  return { url: `${ctx.baseUrl}#p=${payload}`, count: pages.length };
}

/**
 * `publish <folder>` turns a folder's files into one shareable link — the
 * folder-level sibling of `share <file>` (and the same as `share <folder>`). No
 * terminal equivalent (an accepted web divergence, like `share` returning a
 * URL). Self-contained: the content rides in the URL hash, so the link needs no
 * server and works for guests. Opening it drops the files into the recipient's
 * `~/incoming` (see `pia/incoming.ts`).
 */
export const publish: Command = {
  name: "publish",
  help: "publish a folder as a shareable link (its files land in the opener's ~/incoming)",
  usage: "publish <folder>",
  run(args, ctx) {
    const name = args[0];
    if (!name) return ctx.error("publish: specify a folder");

    const result = folderLink(ctx, name);
    if ("error" in result) return ctx.error(`publish: ${result.error}`);

    ctx.print(result.url, "accent");
    ctx.print(
      `(${result.count} file${result.count === 1 ? "" : "s"} — open the link to receive them)`,
      "dim",
    );
  },
};

export const publishCommands: Command[] = [publish];
