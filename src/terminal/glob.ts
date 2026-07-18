/**
 * Shell-level filename globbing: expand `*` and `?` in command arguments
 * against the VFS before a command runs, the way a real shell does.
 *
 * Quoting protects a wildcard: the tokenizer rewrites a `*`/`?` that appeared
 * inside quotes to a private sentinel (below), so `"*.md"` reaches us as a
 * literal, never a pattern. We restore those sentinels to real characters on
 * the way out, so a command never sees them.
 */

/** Sentinels standing in for a *quoted* (literal) wildcard. Private-use area,
 * so a user can't type them. Emitted by the tokenizer, stripped here. */
export const WILD_STAR = String.fromCharCode(0xe000);
export const WILD_QUES = String.fromCharCode(0xe001);

/** Restore quoted-wildcard sentinels back to their literal characters. */
export function unescapeWild(s: string): string {
  return s.split(WILD_STAR).join("*").split(WILD_QUES).join("?");
}

/** Does the token carry an active (unquoted) wildcard to expand? */
function hasWildcard(s: string): boolean {
  return s.includes("*") || s.includes("?");
}

/** The filesystem view globbing needs — kept tiny so it's trivial to fake. */
export interface GlobFs {
  /** Resolve a path (relative to `cwd`) to an absolute path. */
  resolve(cwd: string, path: string): string;
  /** Child entry names of an absolute directory, or null if it isn't one. */
  entries(dirAbs: string): string[] | null;
}

/** Anchor a single path segment's glob (`*.md`, `pic?`) as a RegExp. */
function segmentToRegExp(seg: string): RegExp {
  const escaped = seg
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/**
 * Expand one argument token against the filesystem.
 *
 * v1 scope: only the *final* path segment may glob (`*.md`, `src/*.ts`,
 * `~/notes/pic?.png`). A wildcard earlier in the path is left literal — no
 * cross-directory `*` or recursive `**` yet. Behaviour matches GNU with
 * `nullglob` off: a pattern that matches nothing is passed through unchanged.
 * A leading `*`/`?` does not match dotfiles.
 */
export function expandArg(arg: string, cwd: string, fs: GlobFs): string[] {
  if (!hasWildcard(arg)) return [unescapeWild(arg)];

  const slash = arg.lastIndexOf("/");
  const dirPart = arg.slice(0, slash + 1); // "" or ends with "/"
  const namePart = arg.slice(slash + 1);

  // Only the last segment globs in v1; anything else stays literal.
  if (hasWildcard(dirPart) || !hasWildcard(namePart)) return [unescapeWild(arg)];

  const dir = unescapeWild(dirPart);
  const dirAbs = fs.resolve(cwd, dir === "" ? "." : dir);
  const entries = fs.entries(dirAbs);
  if (!entries) return [unescapeWild(arg)]; // missing dir / not a dir → literal

  const re = segmentToRegExp(namePart);
  const leadingWildcard = namePart.startsWith("*") || namePart.startsWith("?");
  const names = entries
    .filter((name) => !(leadingWildcard && name.startsWith(".")) && re.test(name))
    .sort();
  if (names.length === 0) return [unescapeWild(arg)]; // nullglob off → literal

  return names.map((n) => dir + n);
}

/** Expand every argument, flattening matches left to right. */
export function expandArgs(args: string[], cwd: string, fs: GlobFs): string[] {
  return args.flatMap((a) => expandArg(a, cwd, fs));
}
