import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { FORTUNES, pickFortune } from "./fortune.js";

export { FORTUNES, pickFortune };

/**
 * `fortune` — print a random epigram. Seeded from the clock, so it varies
 * between real invocations while staying deterministic under a frozen test
 * clock (the tour).
 */
const fortune: Command<CoreCommandContext> = {
  name: "fortune",
  help: "print a random epigram",
  usage: "fortune",
  run(_args, ctx) {
    const seed = Date.now();
    const quote = pickFortune(() => (seed % 100000) / 100000);
    for (const line of quote.split("\n")) ctx.print(line);
  },
};

export const pkg: Package = {
  name: "fortune",
  description: "print a random computing epigram",
  commands: [fortune],
};
