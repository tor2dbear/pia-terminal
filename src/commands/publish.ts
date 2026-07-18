import { isDir, isFile } from "../vfs/types.js";
import {
  encodePublish,
  MAX_PUBLISH_PAYLOAD,
  type PublishedPage,
} from "../share/publish.js";
import type { Command } from "./registry.js";

/**
 * `publish <folder>` turns a folder's Markdown files into one shareable web
 * page — the folder-level sibling of `share <file>`. No terminal equivalent (an
 * accepted web divergence, like `share` returning a URL). Self-contained: the
 * content rides in the URL hash, so the link needs no server and works for
 * guests. Opening it shows a read-only page (see `pia/publishView.ts`).
 */
export const publish: Command = {
  name: "publish",
  help: "publish a folder's .md files as a shareable web page",
  usage: "publish <folder>",
  run(args, ctx) {
    const name = args[0];
    if (!name) return ctx.error("publish: specify a folder");

    const dir = ctx.vfs.resolve(ctx.cwd, name);
    const node = ctx.vfs.getNode(dir);
    if (!node) return ctx.error(`publish: no such directory: ${name}`);
    if (!isDir(node)) return ctx.error(`publish: not a directory: ${name}`);

    // Top-level .md files. Subfolders are left out — one flat page keeps the
    // model (and the URL) simple. `index.md` / `README.md` lead, like a static
    // site's home page; the rest follow alphabetically.
    const rank = (name: string): number => {
      const lower = name.toLowerCase();
      return lower === "index.md" ? 0 : lower === "readme.md" ? 1 : 2;
    };
    const pages: PublishedPage[] = ctx.vfs
      .list(dir)
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
      .map((entry) => {
        const fileNode = ctx.vfs.getNode(ctx.vfs.resolve(dir, entry.name));
        return {
          name: entry.name,
          content: fileNode && isFile(fileNode) ? fileNode.content : "",
        };
      });

    if (pages.length === 0) {
      return ctx.error(`publish: no .md files in ${name}`);
    }

    const title = dir.split("/").filter(Boolean).pop() ?? "site";
    const payload = encodePublish({ title, pages });
    if (payload.length > MAX_PUBLISH_PAYLOAD) {
      return ctx.error(
        `publish: ${name} is too large to fit in a link ` +
          `(${Math.round(payload.length / 1024)} KB > ${Math.round(MAX_PUBLISH_PAYLOAD / 1024)} KB). ` +
          "Publish a smaller folder or fewer files.",
      );
    }

    const url = `${ctx.baseUrl}#p=${payload}`;
    ctx.print(url, "accent");
    ctx.print(
      `(${pages.length} page${pages.length === 1 ? "" : "s"} — open the link to view)`,
      "dim",
    );
  },
};

export const publishCommands: Command[] = [publish];
