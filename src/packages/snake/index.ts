import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { Snake } from "./snake.js";

export { Snake };

const snake: Command<CoreCommandContext> = {
  name: "snake",
  help: "play snake (arrows / WASD, or tap on mobile)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new Snake(exit));
  },
};

export const pkg: Package = {
  name: "snake",
  description: "classic snake — steer with arrows/WASD or the on-screen D-pad",
  commands: [snake],
};
