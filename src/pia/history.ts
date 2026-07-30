/**
 * Command-history persistence — PIA's `~/.pia/history`, the HISTFILE idiom. The
 * terminal keeps history in memory for up-arrow; these helpers let `main.ts`
 * load it at boot and append to the file as commands run, so it survives a
 * reload (and, when logged in, syncs across devices with the rest of the VFS).
 *
 * Kept pure (no VFS/DOM) so it's unit-tested and reusable; the file I/O lives in
 * main.ts behind the Terminal's loadHistory/saveHistory seam.
 */

/** Cap on lines kept in the file (bash's HISTSIZE), newest wins. */
export const HISTSIZE = 1000;

/** Parse a history file into lines, dropping blanks. */
export function parseHistory(text: string): string[] {
  return text.split("\n").filter((line) => line.trim() !== "");
}

/** Serialize lines back to file text (trailing newline, or empty for none). */
export function serializeHistory(lines: string[]): string {
  return lines.length ? lines.join("\n") + "\n" : "";
}

/**
 * Append `additions` to `existing` (bash `histappend`), skipping a command that
 * merely repeats the immediately preceding one (HISTCONTROL=ignoredups), and
 * keeping only the most recent `cap`. Appending — rather than overwriting — is
 * what lets two windows share one file without clobbering each other.
 */
export function appendHistory(existing: string[], additions: string[], cap = HISTSIZE): string[] {
  const merged = existing.slice();
  for (const cmd of additions) {
    if (cmd.trim() !== "" && merged[merged.length - 1] !== cmd) merged.push(cmd);
  }
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

/**
 * Auth commands that take a password (or other secret) as a plain argument.
 * Their command line must never reach the persisted, synced history file.
 */
export const SECRET_COMMANDS = ["passwd", "login", "useradd", "register"];

/**
 * True if any of the commands a line runs is secret-bearing (bash `HISTIGNORE`
 * for the auth commands) — used to keep passwords out of persistent history. The
 * caller passes the *resolved* command names (every pipeline stage, aliases
 * expanded), so this is just a membership test; the parsing/alias work that
 * makes `login a b && ls` or `alias p passwd; p pw` catchable lives in the
 * terminal, which already parses the line.
 */
export function hasSecret(commands: readonly string[]): boolean {
  const secrets = new Set(SECRET_COMMANDS);
  return commands.some((c) => secrets.has(c));
}
