import { Editor, type BufferSpec } from "../apps/editor.js";
import { isFile } from "../vfs/types.js";
import { linkedContent, linkedSave } from "./linked.js";
import type { Command } from "./registry.js";

export const nano: Command = {
  name: "nano",
  help: "edit text files in a full-screen editor",
  usage: "nano <file>...",
  aliases: ["edit"],
  async run(args, ctx) {
    if (args.length === 0) return ctx.error("nano: specify a file");

    // One buffer per file argument (`nano a b c`), switchable inside the editor.
    const specs: BufferSpec[] = [];
    for (const name of args) {
      const path = ctx.vfs.resolve(ctx.cwd, name);
      const node = ctx.vfs.getNode(path);
      if (node && !isFile(node)) {
        return ctx.error(`is a directory: ${path}`);
      }

      // A shared (linked) file reads/writes through the cloud; a plain file is
      // edited locally. Either way it opens as a buffer in the same editor.
      if (node && isFile(node) && node.shareId) {
        const content = await linkedContent(ctx, node.shareId, node.content);
        specs.push({
          filename: `${node.name}  👥`,
          content,
          onSave: linkedSave(ctx, path, node.shareId),
        });
      } else {
        specs.push({
          filename: name,
          content: node && isFile(node) ? node.content : "",
          onSave: async (text) => {
            ctx.vfs.writeFile(path, text);
            await ctx.persist();
          },
        });
      }
    }

    await ctx.runApp((exit) => new Editor(specs, exit));
  },
};

export const editCommands: Command[] = [nano];
