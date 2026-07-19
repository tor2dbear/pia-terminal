# Changelog

All notable changes to PIA are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version shown in the boot banner comes from `package.json` (a single source
of truth, injected at build time), so bumping with `npm version <patch|minor|major>`
updates it everywhere. The pre-1.0 history below was reconstructed from the git
log and grouped into milestones.

## [Unreleased]

## [0.10.0] — 2026-07-19

Polish & process.

- **Argument completion**: commands can complete their own arguments; `brew`
  now suggests subcommands and package names (ghost text + Tab).
- **Design pass**: self-hosted JetBrains Mono as the default font; the on-screen
  key bar shows only on touch devices (hidden on desktop) and respects the iOS
  safe-area insets; the boot greeting types itself out.
- **Versioning**: the app version is a single source of truth (`package.json`),
  surfaced in the boot banner; this changelog.

## [0.9.0] — 2026-07-19

Real notifications & offline — the app reaches you when it's closed.

- **`remind`**: server-side push reminders that fire even when the tab is shut
  (PWA + service worker + VAPID + a Supabase `pg_cron` scheduler and Edge
  Function). Verified end-to-end to an iOS lock screen.
- **Collaboration notifications**: a push when someone shares a checklist with you.
- **Offline**: the service worker caches the app shell, so PIA loads and runs
  without a network.
- **Housekeeping**: a daily job prunes delivered notifications and fired reminders.

## [0.8.0] — 2026-07-18

Real Python in the browser.

- **`python`**: runs CPython 3.12 via Pyodide/WASM inside an isolated,
  same-origin sandbox iframe (its own relaxed CSP; the main app stays strict).
- **Self-hosted** Pyodide — no third-party CDN at runtime.
- An interactive **REPL** (`python` with no args) and a **VFS bridge** so scripts
  read your files and their writes show up in `ls`.

## [0.7.0] — 2026-07-18

Packages — apps decoupled from the core.

- **`brew`**: a tiny package manager. Packages are lazy-loaded chunks,
  tree-shaken until installed, re-registered at boot.
- Fourteen packages: `snake`, `2048`, `draw`, `cowsay`, `cal`, `bc`, `fortune`,
  `sl`, `cmatrix`, `tutor`, `life`, `tetris`, `qr`, and `python`.

## [0.6.0] — 2026-07-18

Authoring, sharing polish & scheduling.

- **`nano`** gains multi-buffer editing; **`publish`** turns a folder into a
  shareable page; shared links land in your own session (`~/incoming`).
- **Config**: custom colours + font and zsh-style prompt markup in `~/.pia/config`.
- **`at`/`crontab`**: scheduling as an in-tab learning tool.
- **The tour**: a golden-transcript test that drives a whole session through the
  real terminal.

## [0.5.0] — 2026-07-18

The engine — the terminal core, made reusable.

- Extracted a dependency-free engine (`src/engine/`): command registry, pipe
  parsing, globbing, the screen-app host, the VFS and the adapter seams, generic
  over the command context.
- A second app — a **text adventure** — built on that engine alone, at `/adventure/`.
- Buildable as a standalone npm package.

## [0.4.0] — 2026-07-18

Coreutils & shell fluency.

- Filename **globbing** (`*`, `?`); `cp`, `head`, `tail`, `sort`, `uniq`, `cut`,
  `date`; a `less`/`more` **pager**; command **chaining** (`;`, `&&`, `||`);
  `history`.

## [0.3.0] — 2026-07-17

Platform & polish.

- **Config** file (`~/.pia/config`): themes, prompt, aliases.
- `glow` (Markdown), `json_pp`, `column`; `upload`/`download` real files.
- **Security**: a strict Content-Security-Policy and hardening headers; a PR CI
  gate; a themed 404. Deploy moved to **Cloudflare Pages** with a custom domain.
- Logo, favicon, app icons; the `roadmap/` puck convention.

## [0.2.0] — 2026-07-16

Sharing & collaboration.

- **`share`**: a self-contained public link to a file; **`todo`**: a checklist app.
- **Shared checklists**: real-time collaboration behind a `ShareStore` seam, with
  email invites and Supabase Realtime live-sync.
- Copy & paste on mobile; shared files materialize into `~/shared/`.

## [0.1.0] — 2026-07-15

Foundations — a little computer in the browser.

- A terminal core (input, cursor, history, Tab), an in-memory **VFS**, and the
  filesystem commands.
- A full-screen **`nano`** editor; pipes, redirects, and `grep`/`find`/`wc`.
- Accounts via an `AuthAdapter` (fake by default); `snake`, the first screen-app.
- On-screen keyboard support for mobile; a Supabase backend wired behind a config
  flag. Named **PIA — Personal Integrated Applications**.

[Unreleased]: https://github.com/tor2dbear/pia-terminal/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/tor2dbear/pia-terminal/releases/tag/v0.10.0
