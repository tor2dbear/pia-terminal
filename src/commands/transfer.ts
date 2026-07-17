import { VfsError } from "../vfs/vfs.js";
import type { Command } from "./registry.js";

// upload / download move real files between the user's computer and the VFS.
// There's no Unix equivalent for reaching the OS file picker or download — an
// accepted web divergence, flagged like share→URL and the touch controls.

export const upload: Command = {
  name: "upload",
  help: "upload a file from your computer into the current directory",
  usage: "upload [dir]",
  async run(args, ctx) {
    if (!ctx.pickFile) {
      ctx.error("upload: not supported here");
      return;
    }
    const dir = ctx.vfs.resolve(ctx.cwd, args[0] ?? ".");
    const dest = ctx.vfs.getNode(dir);
    if (!dest || dest.type !== "dir") {
      ctx.error(`upload: not a directory: ${args[0] ?? "."}`);
      return;
    }
    const file = await ctx.pickFile();
    if (!file) {
      ctx.print("upload: cancelled", "dim");
      return;
    }
    const path = ctx.vfs.resolve(dir, file.name);
    ctx.vfs.writeFile(path, file.content);
    await ctx.persist();
    ctx.print(`uploaded ${file.name} → ${path}`, "accent");
  },
};

export const download: Command = {
  name: "download",
  help: "download a file from the VFS to your computer",
  usage: "download <file>",
  run(args, ctx) {
    if (!ctx.saveFile) {
      ctx.error("download: not supported here");
      return;
    }
    if (!args[0]) {
      ctx.error("download: usage — download <file>");
      return;
    }
    const path = ctx.vfs.resolve(ctx.cwd, args[0]);
    let content: string;
    try {
      content = ctx.vfs.readFile(path);
    } catch (err) {
      ctx.error(err instanceof VfsError ? `download: ${err.message}` : String(err));
      return;
    }
    const name = path.split("/").pop() || "download";
    ctx.saveFile(name, content);
    ctx.print(`downloading ${name}`, "dim");
  },
};

export const transferCommands: Command[] = [upload, download];
