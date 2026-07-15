import type { VFS } from "../vfs/vfs.js";
import type { ScreenAppFactory } from "../terminal/screen.js";
import type { AuthAdapter, Session } from "../auth/adapter.js";

export type { Session };

export type LineClass = "normal" | "dim" | "accent" | "error";

/**
 * Everything a command is handed when it runs. Commands talk to the world
 * only through this — never to the DOM or storage directly.
 */
export interface CommandContext {
  vfs: VFS;
  session: Session;
  /** Auth backend, for login/logout. */
  auth: AuthAdapter;
  /** Input piped from a previous command (`""` when there is none). */
  stdin: string;
  /** True when this command's output is captured (piped or redirected). */
  piped: boolean;
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
  /** Hand the screen to a full-screen app; resolves when the app exits. */
  runApp(factory: ScreenAppFactory): Promise<void>;
  /** Reload the filesystem tree from storage (e.g. after a cloud login). */
  reloadFs?(): Promise<void>;
  /** The registry, so `help` can enumerate commands. */
  registry: CommandRegistry;
}

/** A command is a small object: a name, help text, and a run function. */
export interface Command {
  name: string;
  help: string;
  usage?: string;
  /** Alternative names that resolve to this command (e.g. `edit` → `nano`). */
  aliases?: string[];
  run(args: string[], ctx: CommandContext): void | Promise<void>;
}

/** Holds the set of available commands, resolvable by name or alias. */
export class CommandRegistry {
  private byName = new Map<string, Command>();
  private primaries: Command[] = [];

  register(command: Command): this {
    this.byName.set(command.name, command);
    this.primaries.push(command);
    for (const alias of command.aliases ?? []) this.byName.set(alias, command);
    return this;
  }

  get(name: string): Command | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Primary commands (no aliases), sorted by name — used by `help`. */
  all(): Command[] {
    return [...this.primaries].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Names and aliases starting with `prefix`, for Tab-completion. */
  namesStartingWith(prefix: string): string[] {
    return [...this.byName.keys()].filter((n) => n.startsWith(prefix)).sort();
  }
}
