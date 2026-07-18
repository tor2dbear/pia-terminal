import type { CommandRegistry, CoreCommandContext } from "../commands/registry.js";
import type { VFS } from "../vfs/vfs.js";
import type { Package } from "./types.js";

/**
 * The package catalog. Each entry's `load()` is a dynamic import, so a package's
 * code is a separate chunk fetched only when it's installed — the core bundle
 * never pays for a package until you `brew install` it. Same-origin imports, so
 * this stays within the site's strict CSP (unlike fetching third-party code,
 * which the CSP forbids — see the roadmap puck).
 */
export interface CatalogEntry {
  name: string;
  description: string;
  load: () => Promise<Package>;
}

export const CATALOG: Record<string, CatalogEntry> = {
  cowsay: {
    name: "cowsay",
    description: "an ASCII cow says (or thinks) what you type",
    load: () => import("./cowsay/index.js").then((m) => m.pkg),
  },
};

/** Absolute path to the installed-packages list in a home directory. */
export function packagesPath(home: string): string {
  return `${home}/.pia/packages`;
}

/** The set of installed package names, read from ~/.pia/packages. */
export function installedPackages(vfs: VFS, home: string): string[] {
  const node = vfs.getNode(packagesPath(home));
  if (!node || node.type !== "file") return [];
  return node.content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/** Load a package and register its commands into a live registry. */
export async function registerPackage(
  name: string,
  registry: CommandRegistry<CoreCommandContext>,
): Promise<Package | null> {
  const entry = CATALOG[name];
  if (!entry) return null;
  const pkg = await entry.load();
  for (const command of pkg.commands) registry.register(command);
  return pkg;
}

/** At boot: register every package the user has installed, so they survive a
 * reload. Unknown names (e.g. a removed package) are skipped quietly. */
export async function registerInstalled(
  vfs: VFS,
  home: string,
  registry: CommandRegistry<CoreCommandContext>,
): Promise<void> {
  for (const name of installedPackages(vfs, home)) {
    if (CATALOG[name]) await registerPackage(name, registry);
  }
}
