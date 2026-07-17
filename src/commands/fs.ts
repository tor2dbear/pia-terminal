import { VfsError } from "../vfs/vfs.js";
import { isDir, isFile } from "../vfs/types.js";
import type { VNode } from "../vfs/types.js";
import type { Command, CommandContext } from "./registry.js";

/** True if an `-a` / `--all` flag is present (also inside a bundle like `-la`). */
function hasAllFlag(args: string[]): boolean {
  return args.some(
    (a) => a === "--all" || (a.startsWith("-") && !a.startsWith("--") && a.includes("a")),
  );
}

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
  usage: "ls [-a] [path]",
  run(args, ctx) {
    const showAll = hasAllFlag(args);
    const pathArg = args.find((a) => !a.startsWith("-"));
    const target = ctx.vfs.resolve(ctx.cwd, pathArg ?? ".");
    guard(ctx, () => {
      const node = ctx.vfs.getNode(target);
      if (!node) throw new VfsError(`no such file or directory: ${target}`);
      if (!isDir(node)) {
        ctx.print(node.name);
        return;
      }
      // Hide dotfiles (e.g. ~/.pia) unless -a, the way a real `ls` does.
      const entries = ctx.vfs.list(target).filter((e) => showAll || !e.name.startsWith("."));
      if (entries.length === 0) return;
      // `/` marks directories; `@` marks a shared (cloud-linked) file, the way
      // `ls -F` flags a symlink. Suffixes are for the screen only — piped output
      // stays clean names so `ls | grep` keeps working.
      const decorate = (e: VNode, marks: boolean): string => {
        if (e.type === "dir") return `${e.name}/`;
        return marks && isFile(e) && e.shareId ? `${e.name}@` : e.name;
      };
      if (ctx.piped) for (const e of entries) ctx.print(decorate(e, false));
      else ctx.print(entries.map((e) => decorate(e, true)).join("  "));
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
  help: "print the contents of a file (or piped input)",
  usage: "cat [file...]",
  run(args, ctx) {
    if (args.length === 0) {
      // No files: pass piped input straight through.
      if (ctx.stdin) for (const line of ctx.stdin.split("\n")) ctx.print(line);
      return;
    }
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
    const leaving: string[] = [];
    for (const arg of targets) {
      const target = ctx.vfs.resolve(ctx.cwd, arg);
      // Collect any share links under this path *before* removing it — removing
      // a shared file also means leaving the share, else it would just get
      // re-placed in ~/shared on the next login.
      const ids = ctx.vfs.shareIdsUnder(target);
      if (guard(ctx, () => ctx.vfs.remove(target, recursive))) {
        changed = true;
        leaving.push(...ids);
      }
    }
    if (changed) await ctx.persist();
    for (const id of leaving) {
      try {
        await ctx.share?.leave(id);
      } catch {
        /* best-effort — the local file is already gone */
      }
    }
    if (leaving.length > 0) {
      ctx.print(
        `(left ${leaving.length} shared file${leaving.length === 1 ? "" : "s"})`,
        "dim",
      );
    }
  },
};

export const tree: Command = {
  name: "tree",
  help: "show the directory tree (shared files marked @)",
  usage: "tree [-a] [path]",
  run(args, ctx) {
    const showAll = hasAllFlag(args);
    const pathArg = args.find((a) => !a.startsWith("-"));
    const target = ctx.vfs.resolve(ctx.cwd, pathArg ?? ".");
    guard(ctx, () => {
      const node = ctx.vfs.getNode(target);
      if (!node) throw new VfsError(`no such file or directory: ${target}`);
      const suffix = (n: VNode): string =>
        n.type === "dir" ? "/" : isFile(n) && n.shareId ? "@" : "";
      if (!isDir(node)) {
        ctx.print(node.name + suffix(node));
        return;
      }
      ctx.print(target === "/" ? "/" : target.split("/").pop() + "/");
      const walk = (dir: typeof node, prefix: string): void => {
        const kids = Object.values(dir.children)
          .filter((c) => showAll || !c.name.startsWith("."))
          .sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        kids.forEach((child, i) => {
          const last = i === kids.length - 1;
          ctx.print(`${prefix}${last ? "└─ " : "├─ "}${child.name}${suffix(child)}`);
          if (isDir(child)) walk(child, prefix + (last ? "   " : "│  "));
        });
      };
      walk(node, "");
    });
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

export const fsCommands: Command[] = [pwd, ls, cd, mkdir, touch, cat, rm, mv, tree];
