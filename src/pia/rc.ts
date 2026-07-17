/**
 * The user's `~/.pia/config` dotfile — PIA's little rc file. A line-oriented,
 * shell-flavoured format the user edits with `nano ~/.pia/config`:
 *
 *   # comments start with #
 *   theme = amber
 *   prompt = {user}@pia:{cwd}$
 *   alias ll = ls -la
 *
 * Parsing is deliberately lenient (spaces optional, unknown keys ignored); the
 * writers do targeted line edits so hand-written comments and layout survive a
 * `theme`/`alias` command.
 */

export interface PiaConfig {
  theme?: string;
  /** Prompt template with {user} {host} {cwd} placeholders. */
  prompt?: string;
  aliases: Record<string, string>;
}

/** The starter config seeded into a fresh home. */
export const DEFAULT_CONFIG = [
  "# ~/.pia/config — your settings. edit me with `nano ~/.pia/config`.",
  "",
  "# theme: phosphor · amber · ice · mono   (or use `theme <name>`)",
  "theme = phosphor",
  "",
  "# prompt template — placeholders: {user} {host} {cwd}",
  "prompt = {user}@pia:{cwd}$",
  "",
  "# shortcuts — `alias <name> = <expansion>`   (or use `alias ll ls -la`)",
  "alias ll = ls -la",
  "",
].join("\n");

const ALIAS_RE = /^\s*alias\s+(\S+)\s*=\s*(.*)$/;
const KEYVAL_RE = /^\s*([a-zA-Z][\w-]*)\s*=\s*(.*)$/;

/** Parse dotfile text into a config. Blank lines and `#` comments are ignored. */
export function parseConfig(text: string): PiaConfig {
  const cfg: PiaConfig = { aliases: {} };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    const alias = ALIAS_RE.exec(raw);
    if (alias) {
      const [, name, value] = alias;
      cfg.aliases[name] = value.trim();
      continue;
    }
    const kv = KEYVAL_RE.exec(raw);
    if (kv) {
      const [, key, value] = kv;
      if (key === "theme") cfg.theme = value.trim();
      else if (key === "prompt") cfg.prompt = value.trim();
    }
  }
  return cfg;
}

/** Replace the `key = …` line (theme/prompt), or append it if absent. */
export function setConfigValue(text: string, key: "theme" | "prompt", value: string): string {
  const re = new RegExp(`^\\s*${key}\\s*=.*$`);
  return upsert(text, (l) => re.test(l), `${key} = ${value}`);
}

/** Set (or replace) an alias line. */
export function setAlias(text: string, name: string, value: string): string {
  const re = new RegExp(`^\\s*alias\\s+${escapeRe(name)}\\s*=`);
  return upsert(text, (l) => re.test(l), `alias ${name} = ${value}`);
}

/** Remove an alias line. Returns the text unchanged if it wasn't there. */
export function removeAlias(text: string, name: string): string {
  const re = new RegExp(`^\\s*alias\\s+${escapeRe(name)}\\s*=`);
  return text
    .split("\n")
    .filter((l) => !re.test(l))
    .join("\n");
}

/** Replace the first line matching `match`, or append `line` at the end. */
function upsert(text: string, match: (line: string) => boolean, line: string): string {
  const lines = text.split("\n");
  const i = lines.findIndex(match);
  if (i >= 0) {
    lines[i] = line;
    return lines.join("\n");
  }
  // Append, keeping a single trailing newline tidy.
  if (lines.length && lines[lines.length - 1] === "") lines.splice(lines.length - 1, 0, line);
  else lines.push(line);
  return lines.join("\n");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
