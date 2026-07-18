// Finalize the standalone engine package: after `tsc -p tsconfig.engine.json`
// has emitted JS + .d.ts into dist-engine/, write the package's own
// package.json and README so the folder is a self-contained, publishable npm
// package (`cd dist-engine && npm publish`). Run via `npm run build:engine`.
//
// No filesystem tricks beyond writing two files — keep it boring and readable.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-engine");

if (!existsSync(join(out, "engine", "index.js"))) {
  console.error(
    "dist-engine/engine/index.js missing — run `tsc -p tsconfig.engine.json` first.",
  );
  process.exit(1);
}

// Mirror the app version so the two move together, but keep the engine's own name.
const appPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const pkg = {
  name: "pia-terminal-engine",
  version: appPkg.version,
  description:
    "The reusable terminal/shell engine behind PIA — command registry, " +
    "pipe/sequence parsing, filename globbing, a full-screen screen-app host, " +
    "and a DOM renderer. Zero runtime dependencies, ESM, TypeScript types.",
  type: "module",
  types: "./engine/index.d.ts",
  module: "./engine/index.js",
  exports: {
    ".": {
      types: "./engine/index.d.ts",
      import: "./engine/index.js",
    },
  },
  // Pure modules: safe for consumers to tree-shake unused parts.
  sideEffects: false,
  files: ["**/*.js", "**/*.d.ts", "README.md"],
  keywords: [
    "terminal",
    "shell",
    "web-terminal",
    "repl",
    "command-line",
    "typescript",
    "esm",
  ],
  // The engine is meant to be open-sourced, but the specific licence is still an
  // open decision (see the roadmap puck) — pick one before the first publish.
  license: "UNLICENSED",
  repository: {
    type: "git",
    url: "git+https://github.com/tor2dbear/pia-terminal.git",
    directory: "src/engine",
  },
  engines: { node: ">=18" },
};

writeFileSync(join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

const readme = `# pia-terminal-engine

The reusable terminal/shell engine behind [PIA](https://pia.tor2dbear.com) — the
"motor", packaged on its own. Zero runtime dependencies, ESM, ships TypeScript
types.

It gives you a working web terminal you drive with your own commands:

- a **command registry** (\`{ name, help, run(args, ctx) }\`, aliases, Tab-completion),
- shell **parsing** — pipes \`|\`, redirects \`>\`, sequences \`;\` \`&&\` \`||\`,
- filename **globbing** against an in-memory filesystem (**VFS**),
- a **screen-app host** (\`ScreenApp\`) so a full-screen editor/game can take over
  the screen and hand it back,
- a **DOM renderer** (\`Terminal\`) with history, an on-screen key bar for phones,
  and paste handling,
- **adapter seams** (\`StorageAdapter\`, \`AuthAdapter\`) so persistence and accounts
  are swappable — or omitted entirely.

The command context is generic: PIA extends it with its own fields, and a leaner
shell runs on the engine's \`CoreCommandContext\` alone.

## Install

\`\`\`sh
npm install pia-terminal-engine
\`\`\`

## Minimal shell

\`\`\`ts
import { Terminal, CommandRegistry, type CoreCommandContext } from "pia-terminal-engine";

const registry = new CommandRegistry<CoreCommandContext>();
registry.register({
  name: "echo",
  help: "print the arguments",
  run: (args, ctx) => ctx.print(args.join(" ")),
});

// No filesystem, storage, auth or session needed — the engine defaults them.
new Terminal<CoreCommandContext>(document.getElementById("app")!, {
  registry,
  configure: () => ({ prompt: "> " }),
});
\`\`\`

For a fuller example — a small text adventure built entirely on the public API —
see \`src/examples/adventure/\` in the source repository.

## Status

Extracted from PIA and proven by running a second, unrelated app on the same
core. A licence has not been chosen yet — do that before publishing.
`;

writeFileSync(join(out, "README.md"), readme);

console.log("dist-engine/ finalized: package.json + README.md written.");
