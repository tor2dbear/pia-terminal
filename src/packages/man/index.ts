import type { Command, CoreCommandContext } from "../../commands/registry.js";
import type { Package } from "../types.js";
import { Pager } from "../../apps/pager.js";
import { MANPAGES, renderPage, type ManPage } from "./pages.js";

export { MANPAGES, renderPage };

/**
 * Resolve a name to a manual page: a hand-written one from {@link MANPAGES},
 * merged over a skeleton built from the registered command (so its NAME and
 * SYNOPSIS come from the command's own name/usage/help). Returns null when the
 * name is neither a documented topic nor a known command.
 */
function buildPage(name: string, ctx: CoreCommandContext): ManPage | null {
  const rich = MANPAGES[name];
  const cmd = ctx.registry.get(name);
  if (!rich && !cmd) return null;
  return {
    summary: rich?.summary ?? cmd?.help ?? name,
    // A concept page has no command, so only take a synopsis if one was written.
    synopsis: rich?.synopsis ?? (rich?.concept ? undefined : cmd?.usage ?? name),
    description: rich?.description ?? (cmd?.help ? [cmd.help] : []),
    options: rich?.options,
    examples: rich?.examples,
    seeAlso: rich?.seeAlso,
  };
}

/**
 * Everything documentable: concept pages plus every registered name — including
 * aliases (`edit`, `repo`, …), since each resolves to a page via `registry.get`.
 * `namesStartingWith("")` yields every command name and alias.
 */
function allTopics(registry: CoreCommandContext["registry"]): string[] {
  const names = new Set<string>(Object.keys(MANPAGES));
  for (const name of registry.namesStartingWith("")) names.add(name);
  return [...names];
}

/** `man -k` / `apropos`: list topics whose name or summary matches the keyword. */
function apropos(keyword: string, ctx: CoreCommandContext): void {
  const needle = keyword.toLowerCase();
  const hits: string[] = [];
  for (const name of allTopics(ctx.registry).sort()) {
    const page = buildPage(name, ctx);
    if (!page) continue;
    if (name.toLowerCase().includes(needle) || page.summary.toLowerCase().includes(needle)) {
      hits.push(`${name} - ${page.summary}`);
    }
  }
  if (hits.length === 0) return ctx.print(`${keyword}: nothing appropriate.`);
  for (const line of hits) ctx.print(line);
}

async function showPage(name: string, ctx: CoreCommandContext): Promise<void> {
  const page = buildPage(name, ctx);
  if (!page) return ctx.error(`No manual entry for ${name}`);
  const lines = renderPage(name, page);
  // A screen app can't take over mid-pipeline, so when captured just print.
  if (ctx.piped) {
    for (const line of lines) ctx.print(line);
    return;
  }
  await ctx.runApp((exit) => new Pager(`man ${name}`, lines.join("\n"), exit));
}

const man: Command<CoreCommandContext> = {
  name: "man",
  help: "show the manual page for a command or topic",
  usage: "man [-k keyword] [name]",
  run(args, ctx) {
    if (args[0] === "-k") {
      const kw = args[1];
      if (!kw) return ctx.error("usage: man -k keyword");
      return apropos(kw, ctx);
    }
    const name = args.find((a) => !a.startsWith("-"));
    if (!name) return ctx.print("What manual page do you want? (try `man man`)");
    return showPage(name, ctx);
  },
  complete(args, _vfs, registry) {
    // Offer the -k option and every documentable topic for the first operand:
    // concept pages plus every registered command (each has a generated page).
    return args.length === 0 ? ["-k", ...allTopics(registry)] : [];
  },
};

const aproposCmd: Command<CoreCommandContext> = {
  name: "apropos",
  help: "search the manual page names and summaries",
  usage: "apropos keyword",
  run(args, ctx) {
    const kw = args[0];
    if (!kw) return ctx.error("usage: apropos keyword");
    apropos(kw, ctx);
  },
};

export const pkg: Package = {
  name: "man",
  description: "read the manual — man pages for commands and concepts",
  commands: [man, aproposCmd],
};
