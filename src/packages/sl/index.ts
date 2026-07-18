import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { SteamLoco } from "./sl.js";

export { SteamLoco };

const sl: Command<CoreCommandContext> = {
  name: "sl",
  help: "Steam Locomotive — the train you get for mistyping ls",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new SteamLoco(exit));
  },
};

export const pkg: Package = {
  name: "sl",
  description: "a steam locomotive chuffs across the screen (mistype ls…)",
  commands: [sl],
};
