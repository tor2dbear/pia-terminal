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
}
