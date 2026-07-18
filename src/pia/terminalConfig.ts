import { parseConfig, DEFAULT_CONFIG } from "./rc.js";
import { applyTheme, DEFAULT_THEME } from "./themes.js";
import type { VFS } from "../vfs/vfs.js";
import type { TerminalConfig } from "../terminal/terminal.js";

/**
 * PIA glue between the terminal engine and PIA's own dotfile + theming: read
 * `~/.pia/config` (seeding a starter one if absent), apply the theme, and hand
 * the engine back just the prompt + aliases it understands. This is what lets
 * `terminal.ts` stay unaware of the config format and the theme system.
 */
export function loadTerminalConfig(vfs: VFS): TerminalConfig {
  const path = `${vfs.home}/.pia/config`;
  const node = vfs.getNode(path);
  let text: string;
  if (node && node.type === "file") {
    text = vfs.readFile(path);
  } else {
    vfs.mkdirp(`${vfs.home}/.pia`);
    vfs.writeFile(path, DEFAULT_CONFIG);
    text = DEFAULT_CONFIG;
  }
  const cfg = parseConfig(text);
  applyTheme(cfg.theme ?? DEFAULT_THEME);
  return { prompt: cfg.prompt, aliases: cfg.aliases };
}
