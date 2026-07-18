import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { LifeApp } from "./life.js";

export { LifeApp };

const life: Command<CoreCommandContext> = {
  name: "life",
  help: "Conway's Game of Life (space pause, s step, r reseed, ^X exit)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new LifeApp(exit));
  },
};

export const pkg: Package = {
  name: "life",
  description: "Conway's Game of Life — a cellular-automaton sandbox",
  commands: [life],
};
