import { renderMarkdown } from "../pia/markdown.js";
import type { Command } from "./registry.js";
// The changelog is bundled as text at build time, so the terminal can show its
// own history (self-referential, on-brand). Rendered through the same Markdown
// renderer `glow` uses.
import CHANGELOG from "../../CHANGELOG.md?raw";

const VERSION = typeof __PIA_VERSION__ !== "undefined" ? __PIA_VERSION__ : "dev";

const version: Command = {
  name: "version",
  help: "print the PIA version",
  run(_args, ctx) {
    ctx.print(`PIA v${VERSION}`, "accent");
  },
};

const changelog: Command = {
  name: "changelog",
  help: "show what's changed across PIA's versions",
  usage: "changelog   (try `changelog | less` or `changelog | grep python`)",
  aliases: ["whatsnew"],
  run(_args, ctx) {
    for (const { text, cls } of renderMarkdown(CHANGELOG)) ctx.print(text, cls);
  },
};

export const metaCommands: Command[] = [version, changelog];
