import { Editor } from "../apps/editor.js";
import { isFile } from "../vfs/types.js";
import { linkedContent, linkedSave } from "./linked.js";
import type { Command } from "./registry.js";

export const nano: Command = {
  name: "nano",
  help: "edit a text file in a full-screen editor",
  usage: "nano <file>",
  aliases: ["edit"],
  async run(args, ctx) {
    const name = args[0];
    if (!name) return ctx.error("nano: specify a file");

    const path = ctx.vfs.resolve(ctx.cwd, name);
    const node = ctx.vfs.getNode(path);
    if (node && !isFile(node)) {
      return ctx.error(`is a directory: ${path}`);
    }

    // A shared (linked) file reads/writes through the cloud; a plain file is
    // edited locally. Either way it opens in the same editor, in place.
    if (node && isFile(node) && node.shareId) {
      const content = await linkedContent(ctx, node.shareId, node.content);
      const save = linkedSave(ctx, path, node.shareId);
      await ctx.runApp((exit) => new Editor(`${node.name}  👥`, content, save, exit));
      return;
    }

    const content = node && isFile(node) ? node.content : "";
    await ctx.runApp(
      (exit) =>
        new Editor(
          name,
          content,
          async (text) => {
            ctx.vfs.writeFile(path, text);
            await ctx.persist();
          },
          exit,
        ),
    );
  },
};

export const editCommands: Command[] = [nano];
