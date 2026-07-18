import type { VFS } from "../vfs/vfs.js";
import type { ScreenAppFactory } from "../terminal/screen.js";
import type { AuthAdapter, Session } from "../auth/adapter.js";
import type { ShareStore } from "../share/store.js";

export type { Session };

export type LineClass = "normal" | "dim" | "accent" | "error";

/** The outcome of an OS file pick: a text file, a rejection reason, or cancel. */
export type PickResult =
  | { name: string; content: string }
  | { error: "too-large" | "binary" }
  | null;

/**
 * The engine half of a command's toolbox: what *any* shell built on this core
 * offers — I/O, the working directory, the filesystem, the screen-app host,
 * history, and the registry. Nothing here is PIA-specific, so this is the seam
 * a reusable terminal engine would expose. {@link CommandContext} extends it
 * with PIA's own capabilities.
 *
 * Commands talk to the world only through this — never the DOM or storage.
 */
export interface CoreCommandContext {
  vfs: VFS;
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
  /** The command history so far, most recent last (for the `history` command). */
  history?(): string[];
  /** Clear the command history (`history -c`). */
  clearHistory?(): void;
  /** The registry, so `help` can enumerate commands. */
  registry: CommandRegistry;
}

/**
 * PIA's command context: the engine core plus this app's own capabilities
 * (accounts, sharing, the OS file bridges, live config). A different app built
 * on the same engine would extend {@link CoreCommandContext} with its own set.
 */
export interface CommandContext extends CoreCommandContext {
  session: Session;
  /** Auth backend, for login/logout. */
  auth: AuthAdapter;
  /** The app's own URL (origin + path, no hash) — for building share links. */
  baseUrl: string;
  /** Reload the filesystem tree from storage (e.g. after a cloud login). */
  reloadFs?(): Promise<void>;
  /** Re-read ~/.pia/config and apply it (theme, prompt, aliases) live. */
  applyConfig?(): void;
  /**
   * Web bridges (no terminal equivalent — accepted divergences, like share→URL):
   * open the OS file picker, resolving to the chosen text file (or null if
   * cancelled), and trigger a browser download of a VFS file.
   */
  pickFile?(): Promise<PickResult>;
  saveFile?(name: string, content: string): void;
  /** Shared checklists backend, for collaboration (absent → sharing is off). */
  share?: ShareStore;
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
