import { linkedContent, linkedSave } from "./linked.js";
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
    const picked = await ctx.pickFile();
    if (!picked) {
      ctx.print("upload: cancelled", "dim");
      return;
    }
    // The picker enforces a size limit and decodes bytes (UTF-8 → Windows-1252),
    // rejecting binary — so we only get here with a real text file, or a reason.
    if ("error" in picked) {
      ctx.error(
        picked.error === "too-large"
          ? "upload: file too large (max 1 MB)"
          : "upload: only text files are supported (this one looks binary)",
      );
      return;
    }
    const name = picked.name.split(/[\\/]/).pop() || picked.name; // basename only
    const path = ctx.vfs.resolve(dir, name);
    const existing = ctx.vfs.getNode(path);
    const shareId = existing && existing.type === "file" ? existing.shareId : undefined;
    if (shareId) {
      // Overwriting a cloud-linked file: push through the share backend so
      // collaborators get the new content and it isn't lost on the next open.
      await linkedSave(ctx, path, shareId)(picked.content);
    } else {
      ctx.vfs.writeFile(path, picked.content);
      await ctx.persist();
    }
    ctx.print(`uploaded ${name} → ${path}`, "accent");
  },
};

export const download: Command = {
  name: "download",
  help: "download a file from the VFS to your computer",
  usage: "download <file>",
  async run(args, ctx) {
    if (!ctx.saveFile) {
      ctx.error("download: not supported here");
      return;
    }
    if (!args[0]) {
      ctx.error("download: usage — download <file>");
      return;
    }
    const path = ctx.vfs.resolve(ctx.cwd, args[0]);
    const node = ctx.vfs.getNode(path);
    if (!node) {
      ctx.error(`download: no such file: ${args[0]}`);
      return;
    }
    if (node.type !== "file") {
      ctx.error(`download: not a file: ${args[0]}`);
      return;
    }
    // For a cloud-linked file, export the current cloud copy rather than a cache
    // a collaborator may have moved past.
    const content = node.shareId
      ? await linkedContent(ctx, node.shareId, node.content)
      : node.content;
    const name = path.split("/").pop() || "download";
    ctx.saveFile(name, content);
    ctx.print(`downloading ${name}`, "dim");
  },
};

export const transferCommands: Command[] = [upload, download];
