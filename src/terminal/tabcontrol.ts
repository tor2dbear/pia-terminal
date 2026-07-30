/**
 * The control surface a multiplexer ({@link TabManager}) exposes to the rest of
 * the app — notably the `tmux` command, which drives windows without reaching
 * into the manager. Kept in its own dependency-free file so the command context
 * can import the type without pulling in the Terminal (avoiding an import cycle).
 */

export interface TabInfo {
  /** 1-based window number, as shown in the strip and `tmux`. */
  index: number;
  active: boolean;
  /** Short label — the window's working directory (e.g. `~`, `~/notes`). */
  title: string;
}

export interface TabControl {
  /** Open a new window (shares the same machine: one VFS, one account). */
  newWindow(): void;
  /** Switch to the next / previous window, wrapping around. */
  next(): void;
  prev(): void;
  /** Switch to window `index` (1-based); a no-op if it doesn't exist. */
  select(index: number): void;
  /** Close the current window (never the last one). */
  kill(): void;
  /** Snapshot of the open windows, for `tmux` with no args. */
  list(): TabInfo[];
  /** A window *other than the active one* is busy (a command or an app). An
   * account change (which replaces the shared VFS) must refuse while so, or that
   * command's paths would resolve against the wrong account. */
  otherWindowsBusy(): boolean;
  /** Bracket an account transition: while open, other windows refuse to start a
   * new command (so nothing new races the VFS swap through its awaits). */
  beginTransition(): void;
  endTransition(): void;
}
