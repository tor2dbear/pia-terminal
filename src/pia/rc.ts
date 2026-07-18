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

/** The palette tokens a `color.<token> = #hex` line may override. */
export const COLOR_KEYS = ["bg", "fg", "dim", "accent", "error"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export interface PiaConfig {
  theme?: string;
  /** Prompt template with {user} {host} {cwd} placeholders. */
  prompt?: string;
  aliases: Record<string, string>;
  /** Per-token colour overrides (hex), layered on top of the chosen theme. */
  colors: Partial<Record<ColorKey, string>>;
  /** Font-family override (an installed font, by name). */
  font?: string;
  /** Font size in px. */
  fontSize?: number;
}

/** The starter config seeded into a fresh home. */
export const DEFAULT_CONFIG = [
  "# ~/.pia/config — your settings. edit me with `nano ~/.pia/config`,",
  "# then `source ~/.pia/config` to apply (or just reload).",
  "",
  "# theme: phosphor · amber · ice · mono   (or use `theme <name>`)",
  "theme = phosphor",
  "",
  "# custom colours — override the theme, any of: bg fg dim accent error",
  "# color.accent = #ff8800",
  "# color.bg = #001018",
  "",
  "# font (an installed font, by name) and size in px",
  '# font = "Berkeley Mono", monospace',
  "# font-size = 14",
  "",
  "# prompt template — placeholders: {user} {host} {cwd}",
  "prompt = {user}@pia:{cwd}$",
  "",
  "# shortcuts — `alias <name> = <expansion>`   (or use `alias ll ls -la`)",
  "alias ll = ls -la",
  "",
].join("\n");

const ALIAS_RE = /^\s*alias\s+(\S+)\s*=\s*(.*)$/;
const COLOR_RE = /^\s*color\.([a-z]+)\s*=\s*(.*)$/i;
const KEYVAL_RE = /^\s*([a-zA-Z][\w-]*)\s*=\s*(.*)$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// A font-family value: names, quotes, commas, spaces, hyphens. No CSS-breaking
// characters — a bad value is ignored rather than applied.
const FONT_RE = /^[\w\s,"'-]+$/;

function isColorKey(key: string): key is ColorKey {
  return (COLOR_KEYS as readonly string[]).includes(key);
}

/** Parse dotfile text into a config. Blank lines and `#` comments are ignored.
 * Invalid values (bad hex, out-of-range size, odd font) are dropped, not applied. */
export function parseConfig(text: string): PiaConfig {
  const cfg: PiaConfig = { aliases: {}, colors: {} };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    const alias = ALIAS_RE.exec(raw);
    if (alias) {
      const [, name, value] = alias;
      cfg.aliases[name] = value.trim();
      continue;
    }
    const color = COLOR_RE.exec(raw);
    if (color) {
      const key = color[1].toLowerCase();
      const value = color[2].trim();
      if (isColorKey(key) && HEX_RE.test(value)) cfg.colors[key] = value;
      continue;
    }
    const kv = KEYVAL_RE.exec(raw);
    if (kv) {
      const [, key, rawValue] = kv;
      const value = rawValue.trim();
      if (key === "theme") cfg.theme = value;
      else if (key === "prompt") cfg.prompt = value;
      else if (key === "font") {
        if (FONT_RE.test(value)) cfg.font = value;
      } else if (key === "font-size") {
        const n = Number.parseInt(value, 10);
        if (Number.isInteger(n) && n >= 8 && n <= 40) cfg.fontSize = n;
      }
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
