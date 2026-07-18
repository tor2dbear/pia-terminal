// Finalize the standalone engine package: after `tsc -p tsconfig.engine.json`
// has emitted JS + .d.ts into dist-engine/, write the package's own
// package.json, README and LICENSE so the folder is a self-contained,
// publishable npm package (`cd dist-engine && npm publish`). Run via
// `npm run build:engine`.
//
// The MIT licence is scoped to this package: it is written into dist-engine/
// here, not placed at the repo root, so PIA's own source stays unlicensed.
//
// No filesystem tricks beyond writing three files — keep it boring and readable.
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
  files: ["**/*.js", "**/*.d.ts", "README.md", "LICENSE"],
  keywords: [
    "terminal",
    "shell",
    "web-terminal",
    "repl",
    "command-line",
    "typescript",
    "esm",
  ],
  license: "MIT",
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
core.

## Licence

MIT — see the \`LICENSE\` file.
`;

writeFileSync(join(out, "README.md"), readme);

// MIT, scoped to this package (see the header note). Year is fixed rather than
// derived from the clock so repeated builds are byte-for-byte reproducible.
const license = `MIT License

Copyright (c) 2026 Torbjörn Hedberg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

writeFileSync(join(out, "LICENSE"), license);

console.log(
  "dist-engine/ finalized: package.json + README.md + LICENSE written.",
);
