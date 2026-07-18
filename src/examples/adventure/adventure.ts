/**
 * A second, tiny shell built on PIA's terminal engine — a text adventure. It
 * shares *none* of PIA's commands, adapters, themes or config; it only imports
 * the engine's public API (`../../engine`) and implements the same seams. That
 * it runs at all is the proof that the engine is reusable, not a PIA-only core.
 */
import {
  Terminal,
  CommandRegistry,
  VFS,
  type Command,
  type StorageAdapter,
  type AuthAdapter,
} from "../../engine/index.js";
import { World } from "./world.js";

/** Build a registry of adventure commands, all closing over one shared world. */
export function buildAdventureRegistry(world: World): CommandRegistry {
  const reg = new CommandRegistry();
  const print = (ctx: Parameters<Command["run"]>[1], text: string): void => {
    for (const line of text.split("\n")) ctx.print(line);
  };

  reg.register({
    name: "look",
    help: "describe your surroundings",
    aliases: ["l"],
    run: (_a, ctx) => print(ctx, world.look().join("\n")),
  });
  reg.register({
    name: "go",
    help: "go in a direction (north/south/east/west)",
    usage: "go <direction>",
    run: (args, ctx) =>
      print(ctx, args[0] ? world.go(args[0]) : "Go where? Try 'go north'."),
  });
  for (const dir of ["north", "south", "east", "west"]) {
    reg.register({
      name: dir,
      help: `go ${dir}`,
      aliases: [dir[0]],
      run: (_a, ctx) => print(ctx, world.go(dir)),
    });
  }
  reg.register({
    name: "take",
    help: "pick something up",
    usage: "take <item>",
    aliases: ["get"],
    run: (args, ctx) =>
      print(ctx, args[0] ? world.take(args[0]) : "Take what?"),
  });
  reg.register({
    name: "inventory",
    help: "list what you're carrying",
    aliases: ["i", "inv"],
    run: (_a, ctx) => print(ctx, world.inventory()),
  });
  reg.register({
    name: "help",
    help: "list commands",
    run: (_a, ctx) =>
      print(ctx, `Commands: ${reg.all().map((c) => c.name).join(", ")}.`),
  });
  return reg;
}

// The adapter seams the engine needs — the adventure has no accounts or saved
// files, so these are the smallest possible implementations of the contracts.
const nullStorage: StorageAdapter = {
  async load() {
    return null;
  },
  async save() {},
};
const nullAuth: AuthAdapter = {
  requiresPassword: false,
  async current() {
    return { user: "adventurer" };
  },
  async login() {
    throw new Error("there are no accounts in the dungeon");
  },
  async register() {
    throw new Error("there are no accounts in the dungeon");
  },
  async rename() {},
  async logout() {},
};

/** Wire the adventure onto the engine's `Terminal` and show the opening room. */
export function mountAdventure(root: HTMLElement): { term: Terminal; world: World } {
  const world = new World();
  const term = new Terminal(root, {
    // The engine bundles a filesystem; this app doesn't use it, so it gets a
    // throwaway seed. (Making the VFS optional is a later engine refinement.)
    vfs: VFS.seed(),
    adapter: nullStorage,
    auth: nullAuth,
    session: { user: "adventurer" },
    registry: buildAdventureRegistry(world),
    configure: () => ({ prompt: ">" }),
  });
  term.print("A TINY ADVENTURE — built on the same engine as PIA.", "accent");
  term.print("Type 'help', or 'look' to begin.", "dim");
  term.print();
  for (const line of world.look()) term.print(line);
  return { term, world };
}
