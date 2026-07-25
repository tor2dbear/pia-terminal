import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { Wordle, scoreGuess } from "./wordle.js";

export { Wordle, scoreGuess };

const wordle: Command<CoreCommandContext> = {
  name: "wordle",
  help: "guess the hidden five-letter word in six tries",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new Wordle(exit));
  },
};

export const pkg: Package = {
  name: "wordle",
  description: "guess the hidden five-letter word in six tries",
  commands: [wordle],
};
