import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { CmMatrix } from "./cmatrix.js";

export { CmMatrix };

const cmatrix: Command<CoreCommandContext> = {
  name: "cmatrix",
  help: "Matrix-style falling digital rain (q or ^X to quit)",
  async run(_args, ctx) {
    await ctx.runApp((exit) => new CmMatrix(exit));
  },
};

export const pkg: Package = {
  name: "cmatrix",
  description: "Matrix-style falling digital rain",
  commands: [cmatrix],
};
