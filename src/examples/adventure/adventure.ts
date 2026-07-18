/**
 * A second, tiny shell built on PIA's terminal engine — a text adventure. It
 * shares *none* of PIA's commands, adapters, themes or config; it only imports
 * the engine's public API (`../../engine`) and implements the same seams. That
 * it runs at all is the proof that the engine is reusable, not a PIA-only core.
 */
import {
  Terminal,
  CommandRegistry,
  type CoreCommandContext,
} from "../../engine/index.js";
import { World } from "./world.js";

/**
 * The adventure's commands run on the engine's *core* context alone —
 * `CoreCommandContext`, not PIA's richer `CommandContext`. No auth, no share, no
 * baseUrl: the type says exactly what this shell depends on.
 */
type Ctx = CoreCommandContext;

/** Build a registry of adventure commands, all closing over one shared world. */
export function buildAdventureRegistry(world: World): CommandRegistry<Ctx> {
  const reg = new CommandRegistry<Ctx>();
  const print = (ctx: Ctx, text: string): void => {
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

/** Wire the adventure onto the engine's `Terminal` and show the opening room. */
export function mountAdventure(root: HTMLElement): { term: Terminal<Ctx>; world: World } {
  const world = new World();
  // The whole wiring an app needs: its registry and a prompt. No filesystem,
  // storage, auth or session — the engine defaults them all, and this shell uses
  // none of them.
  const term = new Terminal<Ctx>(root, {
    registry: buildAdventureRegistry(world),
    configure: () => ({ prompt: ">" }),
  });
  term.print("A TINY ADVENTURE — built on the same engine as PIA.", "accent");
  term.print("Type 'help', or 'look' to begin.", "dim");
  term.print();
  for (const line of world.look()) term.print(line);
  return { term, world };
}
