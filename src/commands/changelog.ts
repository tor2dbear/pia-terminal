import { renderMarkdown } from "../pia/markdown.js";
import type { Command } from "./registry.js";
import { Pager } from "../apps/pager.js";
// The changelog is bundled as text at build time, so the terminal can show its
// own history (self-referential, on-brand). Rendered through the same Markdown
// renderer `glow` uses.
import CHANGELOG from "../../CHANGELOG.md?raw";
import { VERSION } from "../meta.js";

/**
 * The header + any Unreleased notes + the newest *released* version — the
 * "what's new" slice, so a bare `changelog` doesn't dump the whole (growing)
 * history. Returns the full text unchanged when there's only one release to show.
 */
function latestChangelog(md: string): string {
  const lines = md.split("\n");
  // Released headers carry a date: "## [0.11.0] — 2026-07-25" (Unreleased has none).
  const released = lines.flatMap((l, i) => (/^## \[[^\]]+\]\s+—/.test(l) ? [i] : []));
  if (released.length < 2) return md; // one release — nothing older to trim
  return lines.slice(0, released[1]).join("\n").replace(/\n+$/, "") + "\n";
}

const version: Command = {
  name: "version",
  help: "print the PIA version",
  run(_args, ctx) {
    ctx.print(`PIA v${VERSION}`, "accent");
  },
};

const changelog: Command = {
  name: "changelog",
  help: "show what's changed in PIA (latest by default; --all for the full history)",
  usage: "changelog [--all]   ·   changelog | less   ·   changelog | grep python",
  aliases: ["whatsnew"],
  async run(args, ctx) {
    const all = args[0] === "--all" || args[0] === "-a";
    const latest = latestChangelog(CHANGELOG);
    const trimmed = latest !== CHANGELOG;
    const md = all ? CHANGELOG : latest;

    // Piped: emit plain rendered text so `| grep` / `| less` work (a screen app
    // can't take over mid-pipeline anyway).
    if (ctx.piped) {
      for (const { text } of renderMarkdown(md)) ctx.print(text);
      return;
    }
    // Full history, interactively → the pager, so it scrolls instead of flooding.
    if (all) {
      const text = renderMarkdown(md)
        .map((l) => l.text)
        .join("\n");
      await ctx.runApp((exit) => new Pager("changelog", text, exit));
      return;
    }
    // Default: the latest slice, coloured inline, with a pointer to the rest.
    for (const { text, cls } of renderMarkdown(md)) ctx.print(text, cls);
    if (trimmed) {
      ctx.print("(`changelog --all` for the full history · `changelog | less` to page)", "dim");
    }
  },
};

export const metaCommands: Command[] = [version, changelog];
