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
  /** The command names this package provides — declared here so we can
   * unregister them without importing the package's code. */
  commands: string[];
  load: () => Promise<Package>;
}

export const CATALOG: Record<string, CatalogEntry> = {
  snake: {
    name: "snake",
    description: "classic snake — arrows/WASD or the on-screen D-pad",
    commands: ["snake"],
    load: () => import("./snake/index.js").then((m) => m.pkg),
  },
  "2048": {
    name: "2048",
    description: "slide and merge tiles to reach 2048 (arrow keys / swipe)",
    commands: ["2048"],
    load: () => import("./2048/index.js").then((m) => m.pkg),
  },
  draw: {
    name: "draw",
    description: "a tiny ASCII sketchpad — move, toggle blocks, print the art",
    commands: ["draw"],
    load: () => import("./draw/index.js").then((m) => m.pkg),
  },
  cowsay: {
    name: "cowsay",
    description: "an ASCII cow says (or thinks) what you type",
    commands: ["cowsay", "cowthink"],
    load: () => import("./cowsay/index.js").then((m) => m.pkg),
  },
  cal: {
    name: "cal",
    description: "display a month calendar",
    commands: ["cal"],
    load: () => import("./cal/index.js").then((m) => m.pkg),
  },
  bc: {
    name: "bc",
    description: "an arithmetic calculator (+ - * / % ^, parentheses)",
    commands: ["bc"],
    load: () => import("./bc/index.js").then((m) => m.pkg),
  },
  fortune: {
    name: "fortune",
    description: "print a random computing epigram",
    commands: ["fortune"],
    load: () => import("./fortune/index.js").then((m) => m.pkg),
  },
  sl: {
    name: "sl",
    description: "a steam locomotive chuffs across the screen (mistype ls…)",
    commands: ["sl"],
    load: () => import("./sl/index.js").then((m) => m.pkg),
  },
  cmatrix: {
    name: "cmatrix",
    description: "Matrix-style falling digital rain",
    commands: ["cmatrix"],
    load: () => import("./cmatrix/index.js").then((m) => m.pkg),
  },
  tutor: {
    name: "tutor",
    description: "an interactive course that teaches real terminal commands",
    commands: ["tutor"],
    load: () => import("./tutor/index.js").then((m) => m.pkg),
  },
  life: {
    name: "life",
    description: "Conway's Game of Life — a cellular-automaton sandbox",
    commands: ["life"],
    load: () => import("./life/index.js").then((m) => m.pkg),
  },
  tetris: {
    name: "tetris",
    description: "play Tetris — the falling-blocks classic",
    commands: ["tetris"],
    load: () => import("./tetris/index.js").then((m) => m.pkg),
  },
  qr: {
    name: "qr",
    description: "show a QR code for text or a share link",
    commands: ["qr"],
    load: () => import("./qr/index.js").then((m) => m.pkg),
  },
  python: {
    name: "python",
    description: "run real Python in a sandbox (Pyodide/WASM)",
    commands: ["python"],
    load: () => import("./python/index.js").then((m) => m.pkg),
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

/**
 * Make the live registry match the packages installed in `home` — used when the
 * active account/filesystem changes (login/logout). Drops every catalog
 * package's commands (by their declared names, no import needed), then registers
 * the ones this home has installed. So the previous account's packages don't
 * linger and the new account's become available without a reload.
 */
export async function reconcilePackages(
  vfs: VFS,
  home: string,
  registry: CommandRegistry<CoreCommandContext>,
): Promise<void> {
  for (const entry of Object.values(CATALOG)) {
    for (const name of entry.commands) registry.unregister(name);
  }
  await registerInstalled(vfs, home, registry);
}
