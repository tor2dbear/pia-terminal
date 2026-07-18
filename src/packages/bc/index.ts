import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { evalExpr } from "./bc.js";

export { evalExpr };

/** Evaluate one line, printing either the result or a bc-style error. */
function evalLine(line: string, ctx: CoreCommandContext): void {
  const expr = line.trim();
  if (expr === "") return;
  try {
    ctx.print(String(evalExpr(expr)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.print(`bc: ${message}`, "error");
  }
}

/**
 * `bc` — an arithmetic calculator. Give an expression as arguments
 * (`bc "2 + 3 * 4"`) or pipe expressions in, one per line (`echo 6*7 | bc`).
 */
const bc: Command<CoreCommandContext> = {
  name: "bc",
  help: "evaluate arithmetic expressions",
  usage: "bc <expression>   (or pipe expressions, one per line)",
  run(args, ctx) {
    if (args.length > 0) {
      evalLine(args.join(" "), ctx);
      return;
    }
    if (ctx.stdin !== "") {
      for (const line of ctx.stdin.split("\n")) evalLine(line, ctx);
      return;
    }
    ctx.print("usage: bc <expression>");
  },
};

export const pkg: Package = {
  name: "bc",
  description: "an arithmetic calculator (+ - * / % ^, parentheses)",
  commands: [bc],
};
