import { encodeShare, MAX_SHARE_BYTES } from "../share/share.js";
import { isFile } from "../vfs/types.js";
import type { Command } from "./registry.js";

export const share: Command = {
  name: "share",
  help: "make a public read-only link to a file",
  usage: "share <file>",
  run(args, ctx) {
    const name = args[0];
    if (!name) return ctx.error("share: specify a file");

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
  },
};

export const shareCommands: Command[] = [share];
