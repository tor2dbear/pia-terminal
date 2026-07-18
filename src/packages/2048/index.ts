import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { Game2048 } from "./game2048.js";

export { Game2048 };

const game: Command<CoreCommandContext> = {
  name: "2048",
  help: "slide and merge tiles to reach 2048 (arrows / WASD)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new Game2048(exit));
  },
};

export const pkg: Package = {
  name: "2048",
  description: "slide and merge tiles to reach 2048 (arrow keys / swipe)",
  commands: [game],
};
