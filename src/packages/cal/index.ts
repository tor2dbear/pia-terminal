import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { renderCal } from "./cal.js";

export { renderCal };

/**
 * `cal` — print a month calendar. `cal` (this month), `cal 12` (a month this
 * year), or `cal 12 2026` (an explicit month and year).
 */
const cal: Command<CoreCommandContext> = {
  name: "cal",
  help: "display a calendar for a month",
  usage: "cal [month] [year]",
  run(args, ctx) {
    const now = new Date();
    let month = now.getMonth() + 1;
    let year = now.getFullYear();

    if (args.length >= 1) {
      const m = Number(args[0]);
      if (!Number.isInteger(m) || m < 1 || m > 12) {
        ctx.print(`cal: ${args[0]}: illegal month value`);
        return;
      }
      month = m;
    }
    if (args.length >= 2) {
      const y = Number(args[1]);
      if (!Number.isInteger(y) || y < 1 || y > 9999) {
        ctx.print(`cal: ${args[1]}: illegal year value`);
        return;
      }
      year = y;
    }

    for (const line of renderCal(month, year)) ctx.print(line);
  },
};

export const pkg: Package = {
  name: "cal",
  description: "display a month calendar",
  commands: [cal],
};
