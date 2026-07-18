import type { Command, CoreCommandContext } from "../commands/registry.js";

/**
 * A package: a bundle of commands you `brew install` into your PIA. Packages are
 * decoupled from the core — each lives in its own module under `src/packages/`,
 * is loaded on demand (a separate chunk, tree-shaken until installed), and only
 * touches the engine's {@link CoreCommandContext}. It's the same command seam the
 * built-in commands use, just registered at runtime instead of at boot.
 */
export interface Package {
  name: string;
  description: string;
  commands: Command<CoreCommandContext>[];
}
