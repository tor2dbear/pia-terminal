import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { figlet as render } from "./figlet.js";

export { render as figlet };

const figlet: Command<CoreCommandContext> = {
  name: "figlet",
  help: "print big ASCII banner text (figlet <text>)",
  usage: "figlet <text>",
  run(args, ctx) {
    const text = (args.join(" ") || ctx.stdin).trim();
    if (!text) return ctx.error("figlet: usage — figlet <text>");
    for (const line of render(text)) ctx.print(line, "accent");
  },
};

export const pkg: Package = {
  name: "figlet",
  description: "print big ASCII banner text",
  commands: [figlet],
};
