import { Snake } from "../apps/snake.js";
import type { Command } from "./registry.js";

export const snake: Command = {
  name: "snake",
  help: "play snake (arrows / WASD, or tap on mobile)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new Snake(exit));
  },
};

export const gameCommands: Command[] = [snake];
