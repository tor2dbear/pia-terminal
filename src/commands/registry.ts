import type { VFS } from "../vfs/vfs.js";
import type { ScreenAppFactory } from "../terminal/screen.js";
import type { AuthAdapter, Session } from "../auth/adapter.js";
import type { ShareStore } from "../share/store.js";
import type { ReminderStore } from "../pia/reminders.js";

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
 * history, live config, the OS file bridges, and the registry. Nothing here is
 * app-specific, so this is the seam a reusable terminal engine exposes: a shell
 * built on the engine (see `examples/adventure/`) gets exactly this and no more.
 * {@link CommandContext} extends it with PIA's own capabilities.
 *
 * Commands talk to the world only through this — never the DOM or storage.
 */
export interface CoreCommandContext {
  vfs: VFS;
  /** Who's at the prompt. A mutable reference the engine shares, so a command
   * (e.g. login) can rename the user in place and the prompt follows. */
  session: Session;
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
  /** Reload the filesystem tree from storage (e.g. after a cloud login). */
  reloadFs?(): Promise<void>;
  /** Re-read config and apply it (theme, prompt, aliases) live. */
  applyConfig?(): void;
  /**
   * Web bridges (no terminal equivalent — accepted divergences, like share→URL):
   * open the OS file picker, resolving to the chosen text file (or null if
   * cancelled), and trigger a browser download of a file.
   */
  pickFile?(): Promise<PickResult>;
  saveFile?(name: string, content: string): void;
  /** Hand the screen to a full-screen app; resolves when the app exits. */
  runApp(factory: ScreenAppFactory): Promise<void>;
  /** The command history so far, most recent last (for the `history` command). */
  history?(): string[];
  /** Clear the command history (`history -c`). */
  clearHistory?(): void;
  /** The registry, so `help` can enumerate commands. Typed at the core level:
   * enumeration only needs each command's name/help, not its context. */
  registry: CommandRegistry<CoreCommandContext>;
}

/**
 * PIA's command context: the engine core plus this app's own capabilities
 * (accounts, sharing, share links). A different app built on the same engine
 * would extend {@link CoreCommandContext} with its own set — or, like the
 * adventure example, add nothing and run on the core alone.
 */
export interface CommandContext extends CoreCommandContext {
  /** Auth backend, for login/logout. */
  auth: AuthAdapter;
  /** The app's own URL (origin + path, no hash) — for building share links. */
  baseUrl: string;
  /** Shared checklists backend, for collaboration (absent → sharing is off). */
  share?: ShareStore;
  /** Push-reminder backend (absent → reminders are off, i.e. no cloud). */
  reminders?: ReminderStore;
}

/**
 * A command is a small object: a name, help text, and a run function. Generic
 * over the context it needs: PIA commands are `Command<CommandContext>` (the
 * default); a leaner shell's commands are `Command<CoreCommandContext>`.
 */
export interface Command<Ctx extends CoreCommandContext = CommandContext> {
  name: string;
  help: string;
  usage?: string;
  /** Alternative names that resolve to this command (e.g. `edit` → `nano`). */
  aliases?: string[];
  run(args: string[], ctx: Ctx): void | Promise<void>;
  /**
   * Optional argument completion. Given the argument tokens already typed (after
   * the command name, excluding the fragment being completed) and the VFS,
   * return candidate tokens for this position — e.g. `brew` offers its
   * subcommands, then package names. The terminal filters the candidates by the
   * fragment. Commands without this fall back to filename completion.
   */
  complete?(args: string[], vfs: VFS): string[];
}

/**
 * Holds the set of available commands, resolvable by name or alias. Generic over
 * the context its commands run in (default {@link CommandContext}).
 */
export class CommandRegistry<Ctx extends CoreCommandContext = CommandContext> {
  private byName = new Map<string, Command<Ctx>>();
  private primaries: Command<Ctx>[] = [];

  register(command: Command<Ctx>): this {
    this.byName.set(command.name, command);
    this.primaries.push(command);
    for (const alias of command.aliases ?? []) this.byName.set(alias, command);
    return this;
  }

  /** Remove a command (by primary name) and its aliases — used by `brew
   * uninstall` to drop a package's commands from a live registry. */
  unregister(name: string): void {
    const command = this.byName.get(name);
    if (!command || command.name !== name) return;
    this.byName.delete(command.name);
    for (const alias of command.aliases ?? []) this.byName.delete(alias);
    this.primaries = this.primaries.filter((c) => c !== command);
  }

  get(name: string): Command<Ctx> | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Primary commands (no aliases), sorted by name — used by `help`. */
  all(): Command<Ctx>[] {
    return [...this.primaries].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Names and aliases starting with `prefix`, for Tab-completion. */
  namesStartingWith(prefix: string): string[] {
    return [...this.byName.keys()].filter((n) => n.startsWith(prefix)).sort();
  }
}
