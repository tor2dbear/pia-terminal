# PIA — Personal Integrated Applications

**A little computer in the browser.** PIA is a standalone web terminal — a
filesystem, a text editor, text tools, accounts, sharing, and games — that
behaves like a real shell. It's a place to *learn the terminal* (the muscle
memory transfers straight to a real one) and a self-contained playground.

**Live:** [pia.tor2dbear.com](https://pia.tor2dbear.com)

Named after Pia — a backronym in the spirit of Apple's Lisa.

```
guest@pia:~$ mkdir notes && cd notes
guest@pia:~/notes$ echo "hello" > hi.txt && cat hi.txt
hello
guest@pia:~/notes$ ls | sort | uniq -c
```

---

## What you can do

- **A real filesystem** in memory: `ls`, `cd`, `pwd`, `mkdir`, `touch`, `cp`,
  `mv`, `rm`, `tree`, `find`, plus shell **globbing** (`*.md`).
- **A text editor** — `nano` (full-screen, multi-buffer: `nano a.md b.md`,
  switch with `M-,`/`M-.`), saves with `^O`, exits with `^X`.
- **Text tools & pipes**: `cat`, `head`, `tail`, `sort`, `uniq`, `cut`, `wc`,
  `grep` (with `-n`/`-A`/`-B`/`-C`), `column`, `glow` (render Markdown),
  redirects (`>`, `>>`), pipelines (`|`), and command chaining (`&&`, `||`, `;`).
- **Accounts**: `useradd`/`login`/`logout`/`passwd` — local by default, real
  auth when a backend is configured.
- **Config** in `~/.pia/config`: themes, custom hex colours, font, a coloured
  prompt, and aliases (`source ~/.pia/config` to re-apply). See [Config](#config).
- **Share & publish**: `share <file>` and `share`/`publish <folder>` produce a
  self-contained link; opening it drops the content into the recipient's
  `~/incoming`, in their own session, to keep with `cp`.
- **Scheduling**: `at` (one-off) and `crontab` (recurring) — a learning tool for
  cron syntax that fires while the tab is open.
- **Packages**: `brew install <name>` adds opt-in apps — `snake`, `2048`,
  `draw`, `cowsay`, `cal`, `bc`, `fortune`, `sl`, `cmatrix`, `tutor` — loaded on
  demand. See [Packages](#packages-brew).

Type `help` in the terminal for the full command list.

---

## Design principle: terminal-idiom first

Every command and flow follows Unix/shell convention — real command **names**,
**flags**, and **behaviour**. Prefer the real terminal name (`nano`, `useradd`,
`grep -n`) over friendly/web coinages. Where a flow has no terminal equivalent —
`share`/`publish` returning a URL, `upload`/`download` reaching the OS file
picker, on-screen touch controls — it's called out as a deliberate, accepted web
divergence, not drift.

---

## Architecture

The design is built to stay swappable — the backend was a *swap, not a rewrite*.

- **Adapters are the seam.** The terminal never touches storage or auth directly,
  only the `StorageAdapter` / `AuthAdapter` / `ShareStore` interfaces. Guests get
  `Local`/`Fake`/`Null` implementations; logged-in users get Supabase — behind the
  same interfaces.
- **Command registry.** Each command is `{ name, help, run(args, ctx), aliases? }`.
  Commands reach the world only through a `CommandContext` (print, vfs, auth,
  stdin, runApp, …) — never the DOM or storage.
- **Screen-app host.** Full-screen apps (the editor, the games) implement
  `ScreenApp` and take over the screen via `ctx.runApp()`. A new game or app is
  "just another screen app".
- **VFS.** An in-memory filesystem tree, serialized by the storage adapter.

### Layout

```
src/vfs/        filesystem tree + path resolution
src/storage/    StorageAdapter + Local/Memory
src/auth/       AuthAdapter + Fake/Memory
src/share/      share.ts / publish.ts (URL links) + store.ts (ShareStore)
src/supabase/   cloud adapters (dynamic-imported; dormant without config)
src/commands/   command registry + commands
src/apps/       screen apps (editor, todo)
src/packages/   brew packages (lazy-loaded, opt-in): snake, 2048, draw, cowsay,
                cal, bc, fortune, sl, cmatrix, tutor
src/terminal/   terminal core (input, cursor, history, Tab, pipes) + app host
src/engine/     the reusable engine's public API (index.ts)
src/examples/   a second app on the engine (a text adventure)
roadmap/        one markdown file per planned item ("puck")
```

---

## The engine

PIA's terminal core is **extractable**. `src/engine/index.ts` is a
dependency-free public API — command registry, pipe/sequence parsing, globbing,
the screen-app host, the `Terminal` DOM renderer, the VFS, and the adapter
seams. `src/examples/adventure/` is a **second, unrelated app** (a text
adventure) built on that API alone, opened at `/adventure/` and sharing the same
`terminal-*.js` chunk as PIA in the build.

`Command`, `CommandRegistry` and `Terminal` are generic over the command
context: PIA extends `CoreCommandContext` with its own fields via
`TerminalOptions.extendContext`; a leaner shell runs on the core alone.

`npm run build:engine` builds the engine as a standalone, installable npm package
into `dist-engine/`.

---

## Packages (brew)

Optional apps are **decoupled from the core** and installed on demand:

```
guest@pia:~$ brew list
guest@pia:~$ brew install snake
installed snake — commands: snake
guest@pia:~$ snake
```

Each package lives in `src/packages/<name>/` and exports a manifest
(`{ name, description, commands }`). The catalog maps names to **dynamic-import
loaders**, so a package's code is a separate chunk fetched only when installed —
the core bundle never pays for it. Installed packages persist in
`~/.pia/packages` and are re-registered at boot.

Because of the strict CSP (`script-src 'self'`), packages are same-origin and
curated — not arbitrary third-party code from the internet.

---

## Config

`~/.pia/config` is a small rc file you edit with `nano ~/.pia/config`, then
apply with `source ~/.pia/config` (or a reload):

```
theme = phosphor            # phosphor · amber · ice · mono
color.accent = #ff8800      # override any of: bg fg dim accent error
font = "Berkeley Mono", monospace
font-size = 15
prompt = %F{accent}{user}%f:%F{dim}{cwd}%f$    # zsh-style colour markup
alias ll = ls -la
```

Themes and colours apply via the CSSOM (CSP-safe). The prompt supports zsh-style
`%F{token|#hex}…%f` colour and `%B…%b` bold, with placeholders `{user}`
`{host}` `{cwd}`.

---

## Development

TypeScript + Vite + Vitest. Node 18+.

```
npm install
npm run dev          # dev server
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run build        # production build → dist/
```

Run `npm run typecheck && npm test && npm run build` before shipping.

**The tour** (`src/tour.test.ts` → `src/tour.golden.txt`) is one scripted
session driven through the real terminal, snapshotted as a human-readable golden
transcript. When you add a feature, add lines to `TOUR`, run `npx vitest -u`, and
review the golden diff — that diff is the output verification. It's deterministic
(frozen clock, redacted volatile output) and checks output/behaviour, not pixels.

Tests prefer driving real behaviour (the jsdom terminal, injected rng) over
shallow unit tests.

---

## Deploy

Cloudflare Pages builds on push to `main` (`npm run build` → `dist/`) and serves
the custom domain over HTTPS; every PR gets its own preview URL. Work lands via
**branch → PR → CI → merge** — `.github/workflows/ci.yml` runs typecheck, tests
and build on each PR (required by branch protection on `main`).

Security headers — CSP, `frame-ancestors`, `X-Frame-Options`, … — are emitted at
build time (`dist/_headers` plus a matching `<meta>` CSP) by the `vite.config.ts`
plugin. Cloud config lives in committed `.env.production` (public client keys;
RLS is the security boundary). With no Supabase configured, the app is fully
local and the cloud path is tree-shaken out.

---

## Roadmap

Planned work lives in `roadmap/` as one markdown file per item ("puck"), each
with YAML frontmatter and a free-form body. Status flows
`inbox → now / next / later → done`. See `roadmap/README.md` for the convention.
