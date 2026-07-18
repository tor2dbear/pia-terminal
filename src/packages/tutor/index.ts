import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { Tutor } from "./tutor.js";

export { Tutor };

const tutor: Command<CoreCommandContext> = {
  name: "tutor",
  help: "an interactive terminal course — learn real shell commands",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new Tutor(exit));
  },
};

export const pkg: Package = {
  name: "tutor",
  description: "an interactive course that teaches real terminal commands",
  commands: [tutor],
};
