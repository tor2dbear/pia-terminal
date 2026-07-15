import type { VFS } from "../vfs/vfs.js";

export type LineClass = "normal" | "dim" | "accent" | "error";

/** The session's identity. Fake for now; a real AuthAdapter lands later. */
export interface Session {
  user: string;
}

/**
 * Everything a command is handed when it runs. Commands talk to the world
 * only through this — never to the DOM or storage directly.
 */
export interface CommandContext {
  vfs: VFS;
  session: Session;
  /** Current working directory, absolute. */
  cwd: string;
  /** Change the working directory (validated by the caller of the command). */
  setCwd(path: string): void;
  /** Print a line of output. */
  print(text?: string, cls?: LineClass): void;
  /** Print an error line. */
  error(text: string): void;
  /** Clear the screen. */
  clear(): void;
  /** Persist the filesystem after a mutation. */
  persist(): Promise<void>;
  /** The registry, so `help` can enumerate commands. */
  registry: CommandRegistry;
}

/** A command is a small object: a name, help text, and a run function. */
export interface Command {
  name: string;
  help: string;
  usage?: string;
  run(args: string[], ctx: CommandContext): void | Promise<void>;
}

/** Holds the set of available commands, keyed by name. */
export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): this {
    this.commands.set(command.name, command);
    return this;
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  /** All commands, sorted by name — used by `help` and Tab-completion. */
  all(): Command[] {
    return [...this.commands.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /** Command names starting with `prefix`, for Tab-completion. */
  namesStartingWith(prefix: string): string[] {
    return this.all()
      .map((c) => c.name)
      .filter((n) => n.startsWith(prefix));
  }
}
