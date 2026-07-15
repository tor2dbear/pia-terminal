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
  help: "print the current directory path",
  run(_args, ctx) {
    ctx.print(ctx.cwd);
  },
};

export const ls: Command = {
  name: "ls",
  help: "list the contents of a directory",
  usage: "ls [path]",
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
  help: "change the current directory",
  usage: "cd [path]",
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
  help: "create a new directory",
  usage: "mkdir <name> [name...]",
  async run(args, ctx) {
    if (args.length === 0) return ctx.error("mkdir: specify at least one name");
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
  help: "create an empty file (leaving an existing one untouched)",
  usage: "touch <file> [file...]",
  async run(args, ctx) {
    if (args.length === 0) return ctx.error("touch: specify at least one file");
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
  help: "print the contents of a file",
  usage: "cat <file> [file...]",
  run(args, ctx) {
    if (args.length === 0) return ctx.error("cat: specify at least one file");
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
  help: "remove files or directories (-r for directories)",
  usage: "rm [-r] <path> [path...]",
  async run(args, ctx) {
    const recursive = args.includes("-r") || args.includes("-rf");
    const targets = args.filter((a) => !a.startsWith("-"));
    if (targets.length === 0) return ctx.error("rm: specify at least one path");
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
  help: "move or rename a file or directory",
  usage: "mv <source> <dest>",
  async run(args, ctx) {
    if (args.length !== 2) return ctx.error("mv: specify source and destination");
    const from = ctx.vfs.resolve(ctx.cwd, args[0]);
    const to = ctx.vfs.resolve(ctx.cwd, args[1]);
    if (guard(ctx, () => ctx.vfs.move(from, to))) await ctx.persist();
  },
};

export const fsCommands: Command[] = [pwd, ls, cd, mkdir, touch, cat, rm, mv];
