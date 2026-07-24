import { DemoReel } from "../apps/demo.js";
import type { Command } from "./registry.js";

// `demo` plays a looping, self-running tour of PIA — for portfolio screen
// recordings. It's a full-screen app (like the games), so it can't run in a
// pipeline; any key exits.

export const demo: Command = {
  name: "demo",
  help: "play a looping, self-running tour of PIA (any key to exit)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new DemoReel(exit));
  },
};

export const demoCommands: Command[] = [demo];
