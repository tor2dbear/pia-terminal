import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";

/** Draw a speech (or thought) bubble around a line of text. */
function bubble(text: string, think: boolean): string[] {
  const line = ` ${text} `;
  const [l, r] = think ? ["(", ")"] : ["<", ">"];
  return [` ${"_".repeat(line.length)}`, `${l}${line}${r}`, ` ${"-".repeat(line.length)}`];
}

/** The cow. `think` swaps the tether for the thought-bubble dots. */
function cow(think: boolean): string[] {
  const t = think ? "o" : "\\";
  return [
    `        ${t}   ^__^`,
    `         ${t}  (oo)\\_______`,
    `            (__)\\       )\\/\\`,
    `                ||----w |`,
    `                ||     ||`,
  ];
}

function say(think: boolean): Command<CoreCommandContext>["run"] {
  return (args, ctx) => {
    const text = args.join(" ") || "moo";
    for (const line of [...bubble(text, think), ...cow(think)]) ctx.print(line);
  };
}

const cowsay: Command<CoreCommandContext> = {
  name: "cowsay",
  help: "an ASCII cow says what you type",
  usage: "cowsay <text>",
  run: say(false),
};

const cowthink: Command<CoreCommandContext> = {
  name: "cowthink",
  help: "an ASCII cow thinks what you type",
  usage: "cowthink <text>",
  run: say(true),
};

export const pkg: Package = {
  name: "cowsay",
  description: "an ASCII cow says (or thinks) what you type",
  commands: [cowsay, cowthink],
};
