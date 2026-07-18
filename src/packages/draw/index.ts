import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { Draw } from "./draw.js";

export { Draw };

const draw: Command<CoreCommandContext> = {
  name: "draw",
  help: "a tiny ASCII sketchpad — the drawing prints back when you exit",
  async run(_args, ctx) {
    await ctx.runApp(
      (exit) =>
        new Draw(exit, (art) => {
          ctx.print("— your sketch —", "dim");
          for (const line of art.split("\n")) ctx.print(line);
        }),
    );
  },
};

export const pkg: Package = {
  name: "draw",
  description: "a tiny ASCII sketchpad — move, toggle blocks, print the art",
  commands: [draw],
};
