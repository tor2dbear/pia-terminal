import { VfsError } from "../vfs/vfs.js";
import { isDir } from "../vfs/types.js";
import type { Command, CommandContext } from "./registry.js";

/** Run `fn`, printing a VfsError as an error line instead of throwing. */
function guard(ctx: CommandContext, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (err) {
    if (err instanceof VfsError) {
      ctx.error(err.message);
      return false;
    }
    throw err;
  }
}

export const pwd: Command = {
  name: "pwd",
  help: "skriv ut sökvägen till nuvarande mapp",
  run(_args, ctx) {
    ctx.print(ctx.cwd);
  },
};

export const ls: Command = {
  name: "ls",
  help: "lista innehållet i en mapp",
  usage: "ls [sökväg]",
  run(args, ctx) {
    const target = ctx.vfs.resolve(ctx.cwd, args[0] ?? ".");
    guard(ctx, () => {
      const node = ctx.vfs.getNode(target);
      if (!node) throw new VfsError(`no such file or directory: ${target}`);
      if (!isDir(node)) {
        ctx.print(node.name);
        return;
      }
      const entries = ctx.vfs.list(target);
      if (entries.length === 0) return;
      const names = entries.map((e) => (e.type === "dir" ? `${e.name}/` : e.name));
      ctx.print(names.join("  "));
    });
  },
};

export const cd: Command = {
  name: "cd",
  help: "byt nuvarande mapp",
  usage: "cd [sökväg]",
  run(args, ctx) {
    const target = ctx.vfs.resolve(ctx.cwd, args[0] ?? "~");
    guard(ctx, () => {
      ctx.vfs.getDir(target); // throws if missing / not a dir
      ctx.setCwd(target);
    });
  },
};

export const mkdir: Command = {
  name: "mkdir",
  help: "skapa en ny mapp",
  usage: "mkdir <namn> [namn...]",
  async run(args, ctx) {
    if (args.length === 0) return ctx.error("mkdir: ange minst ett namn");
    let changed = false;
    for (const arg of args) {
      const target = ctx.vfs.resolve(ctx.cwd, arg);
      if (guard(ctx, () => ctx.vfs.mkdir(target))) changed = true;
    }
    if (changed) await ctx.persist();
  },
};

export const touch: Command = {
  name: "touch",
  help: "skapa en tom fil (eller lämna en befintlig orörd)",
  usage: "touch <fil> [fil...]",
  async run(args, ctx) {
    if (args.length === 0) return ctx.error("touch: ange minst en fil");
    let changed = false;
    for (const arg of args) {
      const target = ctx.vfs.resolve(ctx.cwd, arg);
      if (guard(ctx, () => ctx.vfs.touch(target))) changed = true;
    }
    if (changed) await ctx.persist();
  },
};

export const cat: Command = {
  name: "cat",
  help: "skriv ut innehållet i en fil",
  usage: "cat <fil> [fil...]",
  run(args, ctx) {
    if (args.length === 0) return ctx.error("cat: ange minst en fil");
    for (const arg of args) {
      const target = ctx.vfs.resolve(ctx.cwd, arg);
      guard(ctx, () => {
        const content = ctx.vfs.readFile(target);
        // Print each line so blank content still advances naturally.
        for (const line of content.split("\n")) ctx.print(line);
      });
    }
  },
};

export const rm: Command = {
  name: "rm",
  help: "ta bort filer eller mappar (-r för mappar)",
  usage: "rm [-r] <sökväg> [sökväg...]",
  async run(args, ctx) {
    const recursive = args.includes("-r") || args.includes("-rf");
    const targets = args.filter((a) => !a.startsWith("-"));
    if (targets.length === 0) return ctx.error("rm: ange minst en sökväg");
    let changed = false;
    for (const arg of targets) {
      const target = ctx.vfs.resolve(ctx.cwd, arg);
      if (guard(ctx, () => ctx.vfs.remove(target, recursive))) changed = true;
    }
    if (changed) await ctx.persist();
  },
};

export const mv: Command = {
  name: "mv",
  help: "flytta eller byt namn på en fil/mapp",
  usage: "mv <källa> <mål>",
  async run(args, ctx) {
    if (args.length !== 2) return ctx.error("mv: ange källa och mål");
    const from = ctx.vfs.resolve(ctx.cwd, args[0]);
    const to = ctx.vfs.resolve(ctx.cwd, args[1]);
    if (guard(ctx, () => ctx.vfs.move(from, to))) await ctx.persist();
  },
};

export const fsCommands: Command[] = [pwd, ls, cd, mkdir, touch, cat, rm, mv];
