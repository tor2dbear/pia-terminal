import {
  CATALOG,
  installedPackages,
  packagesPath,
  registerPackage,
} from "../packages/catalog.js";
import type { Command, CommandContext } from "./registry.js";

async function setInstalled(ctx: CommandContext, names: string[]): Promise<void> {
  ctx.vfs.mkdirp(`${ctx.vfs.home}/.pia`);
  ctx.vfs.writeFile(packagesPath(ctx.vfs.home), names.length ? names.join("\n") + "\n" : "");
  await ctx.persist();
}

/**
 * `brew` — a tiny package manager. Packages live in `src/packages/`, are loaded
 * on demand (their code is a separate chunk), and register their commands into
 * the live registry. Installed names persist in ~/.pia/packages and are
 * re-registered at boot. Same-origin only — the strict CSP forbids fetching
 * third-party code, so this is a curated catalog, not "install anything".
 */
export const brew: Command = {
  name: "brew",
  // `apt` is a familiar alias for anyone coming from Debian/Ubuntu; the
  // subcommand grammar (list/install/uninstall) is the same either way.
  aliases: ["apt"],
  help: "install optional command packages (brew list | install <name> | uninstall <name>)",
  usage: "brew list · brew install <name> · brew uninstall <name>   (alias: apt)",
  async run(args, ctx) {
    const sub = args[0] ?? "list";
    const home = ctx.vfs.home;

    if (sub === "list" || sub === "ls") {
      const installed = new Set(installedPackages(ctx.vfs, home));
      for (const entry of Object.values(CATALOG)) {
        const on = installed.has(entry.name);
        ctx.print(`${on ? "✓" : " "} ${entry.name.padEnd(12)} ${entry.description}`, on ? "accent" : "normal");
      }
      ctx.print("install with `brew install <name>`", "dim");
      return;
    }

    if (sub === "install" || sub === "add") {
      const name = args[1];
      if (!name || !CATALOG[name]) {
        return ctx.error(`brew: unknown package '${name ?? ""}' — see 'brew list'`);
      }
      const installed = installedPackages(ctx.vfs, home);
      if (installed.includes(name)) return ctx.print(`${name} is already installed`, "dim");
      const pkg = await registerPackage(name, ctx.registry);
      if (!pkg) return ctx.error(`brew: could not load '${name}'`);
      await setInstalled(ctx, [...installed, name]);
      ctx.print(`installed ${name} — commands: ${pkg.commands.map((c) => c.name).join(", ")}`, "accent");
      return;
    }

    if (sub === "uninstall" || sub === "remove" || sub === "rm") {
      const name = args[1];
      const installed = installedPackages(ctx.vfs, home);
      if (!name || !installed.includes(name)) {
        return ctx.error(`brew: '${name ?? ""}' is not installed`);
      }
      const entry = CATALOG[name];
      if (entry) {
        const pkg = await entry.load();
        for (const command of pkg.commands) ctx.registry.unregister(command.name);
      }
      await setInstalled(ctx, installed.filter((n) => n !== name));
      ctx.print(`uninstalled ${name}`, "dim");
      return;
    }

    ctx.error("brew: usage — brew list · brew install <name> · brew uninstall <name>");
  },
  complete(args, vfs) {
    // First argument: the subcommand.
    if (args.length === 0) return ["list", "install", "uninstall"];
    const sub = args[0];
    // `install <name>` completes packages that aren't installed yet…
    if (sub === "install" || sub === "add") {
      const installed = new Set(installedPackages(vfs, vfs.home));
      return Object.keys(CATALOG).filter((name) => !installed.has(name));
    }
    // …`uninstall <name>` completes the ones that are.
    if (sub === "uninstall" || sub === "remove" || sub === "rm") {
      return installedPackages(vfs, vfs.home);
    }
    return [];
  },
};

export const brewCommands: Command[] = [brew];
