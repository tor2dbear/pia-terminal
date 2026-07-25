import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { Piano, noteFreq } from "./piano.js";

export { Piano, noteFreq };

const piano: Command<CoreCommandContext> = {
  name: "piano",
  help: "a little synth piano (a s d f… to play, z/x to shift octave)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new Piano(exit));
  },
};

export const pkg: Package = {
  name: "piano",
  description: "a little Web Audio synth piano",
  commands: [piano],
};
