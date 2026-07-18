import type { Command, CommandContext } from "./registry.js";
import { THEMES, themeNames, DEFAULT_THEME } from "../pia/themes.js";
import {
  parseConfig,
  setConfigValue,
  setAlias,
  removeAlias,
  DEFAULT_CONFIG,
} from "../pia/rc.js";

/** Absolute path to the user's dotfile in their current home. */
function rcPath(ctx: CommandContext): string {
  return `${ctx.vfs.home}/.pia/config`;
}

/** Read the dotfile, falling back to the default text if it isn't there yet. */
function readRc(ctx: CommandContext): string {
  const path = rcPath(ctx);
  const node = ctx.vfs.getNode(path);
  return node && node.type === "file" ? ctx.vfs.readFile(path) : DEFAULT_CONFIG;
}

/** Write the dotfile (creating ~/.pia if needed), persist, and re-apply. */
async function writeRc(ctx: CommandContext, text: string): Promise<void> {
  ctx.vfs.mkdirp(`${ctx.vfs.home}/.pia`);
  ctx.vfs.writeFile(rcPath(ctx), text);
  await ctx.persist();
  ctx.applyConfig?.();
}

export const theme: Command = {
  name: "theme",
  help: "switch colour theme (theme <name>, or list them)",
  usage: "theme [name]",
  run(args, ctx) {
    const current = parseConfig(readRc(ctx)).theme ?? DEFAULT_THEME;
    if (args.length === 0) {
      for (const name of themeNames()) {
        ctx.print(name === current ? `* ${name}` : `  ${name}`, name === current ? "accent" : "normal");
      }
      ctx.print("switch with `theme <name>`", "dim");
      return;
    }
    const name = args[0];
    if (!THEMES[name]) {
      ctx.error(`theme: unknown theme '${name}' — try: ${themeNames().join(", ")}`);
      return;
    }
    return writeRc(ctx, setConfigValue(readRc(ctx), "theme", name)).then(() =>
      ctx.print(`theme set to ${name}`, "accent"),
    );
  },
};

export const alias: Command = {
  name: "alias",
  help: "make a shortcut (alias ll ls -la), or list aliases",
  usage: "alias [name expansion]",
  run(args, ctx) {
    const aliases = parseConfig(readRc(ctx)).aliases;
    if (args.length === 0) {
      const names = Object.keys(aliases).sort();
      if (names.length === 0) ctx.print("(no aliases — `alias ll ls -la`)", "dim");
      else for (const n of names) ctx.print(`alias ${n} = ${aliases[n]}`);
      return;
    }

    // Accept `alias ll ls -la`, `alias ll = ls -la`, and `alias ll=ls -la`.
    let name: string;
    let value: string;
    if (args[1] === "=") {
      name = args[0];
      value = args.slice(2).join(" ").trim();
    } else if (args[0].includes("=")) {
      const joined = args.join(" ");
      const i = joined.indexOf("=");
      name = joined.slice(0, i).trim();
      value = joined.slice(i + 1).trim();
    } else {
      name = args[0];
      value = args.slice(1).join(" ").trim();
    }
    if (!name || /[\s=]/.test(name)) {
      ctx.error("alias: usage — alias <name> <expansion>");
      return;
    }
    if (!value) {
      // `alias name` alone → show just that one.
      if (aliases[name]) ctx.print(`alias ${name} = ${aliases[name]}`);
      else ctx.error(`alias: ${name} not set`);
      return;
    }
    return writeRc(ctx, setAlias(readRc(ctx), name, value)).then(() =>
      ctx.print(`aliased ${name} → ${value}`, "accent"),
    );
  },
};

export const unalias: Command = {
  name: "unalias",
  help: "remove an alias (unalias ll)",
  usage: "unalias <name>",
  run(args, ctx) {
    const name = args[0];
    if (!name) {
      ctx.error("unalias: usage — unalias <name>");
      return;
    }
    const rc = readRc(ctx);
    if (!parseConfig(rc).aliases[name]) {
      ctx.error(`unalias: ${name} not set`);
      return;
    }
    return writeRc(ctx, removeAlias(rc, name)).then(() => ctx.print(`removed alias ${name}`, "dim"));
  },
};

export const source: Command = {
  name: "source",
  help: "re-read ~/.pia/config and apply it (theme, colours, font, prompt, aliases)",
  usage: "source ~/.pia/config",
  aliases: ["."],
  run(args, ctx) {
    const cfgPath = rcPath(ctx);
    const target = args[0] ? ctx.vfs.resolve(ctx.cwd, args[0]) : cfgPath;
    // PIA can't execute arbitrary scripts — `source` only re-applies the config.
    if (target !== cfgPath) {
      ctx.error("source: only ~/.pia/config can be sourced");
      return;
    }
    ctx.applyConfig?.();
    ctx.print("re-applied ~/.pia/config", "dim");
  },
};

export const configCommands: Command[] = [theme, alias, unalias, source];
