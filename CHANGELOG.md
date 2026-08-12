# Changelog

All notable changes to PIA are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version shown in the boot banner comes from `package.json` (a single source
of truth, injected at build time), so bumping with `npm version <patch|minor|major>`
updates it everywhere. The pre-1.0 history below was reconstructed from the git
log and grouped into milestones.

## [Unreleased]

### Added
- **`sh` — run script files.** `sh script.sh` reads a file and runs it line by
  line through the real shell, so pipes, `;`/`&&`/`||`, redirects and globbing
  all work as at the prompt. Also `sh -c "<command>"` for a one-off string and
  `cat script | sh` (stdin as the script). Blank lines and `#` comments
  (including a `#!` shebang) are skipped; like a shell without `set -e` a failing
  line doesn't stop the script, and the exit status is the last command's. `bash`
  is an alias. (`chmod +x` / `./script` needs an exec-bit in the VFS — a noted
  follow-up.)

### Fixed
- **`python` now runs in production.** The Pyodide sandbox iframe ran under the
  app's strict CSP in prod, so its WASM was blocked and `python` hung silently.
  Two causes: Cloudflare Pages "clean URLs" 308-redirect `/python-sandbox.html` →
  `/python-sandbox` (the relaxed CSP only matched the `.html` path), and — the
  deeper one — Cloudflare `_headers` *append* rules, so the sandbox got the strict
  `/*` policy on top of its relaxed one and the browser enforced the intersection.
  The strict CSP now lives on the app document paths (`/`, the adventure example)
  instead of `/*`, so the sandbox receives only its relaxed policy; the main app's
  protection is unchanged (its `<meta>` CSP + `X-Frame-Options: DENY`). The sandbox
  also reports a load failure back to the terminal instead of hanging, and the
  bridge times out and retries on a fresh iframe.

## [0.15.0] — 2026-08-09

The MCP connector grows up. An external AI client (Claude's OAuth-only connector
included) can read your files and write within a per-token scope, reached
on-brand at `pia.tor2dbear.com/mcp` with PIA's own icon — and on connect the
connector introduces PIA to the AI so it knows what it's talking to.

### Added
- **The MCP connector introduces PIA to the AI.** `initialize` now returns an
  `instructions` brief (a hint clients add to the model's system prompt) that
  weaves PIA's persona with a practical guide: the filesystem layout, the token's
  *live* write scope, and the exact `mcp scope <name> --full` / `--write` /
  `--read-only` commands the owner runs to change what the connector may do — so
  the connected AI can answer "how do I give you full access?" with the real
  token name. Edge Function only; redeploy to apply.
- **`mcp scope <label>` — change a token's write scope in place.** Widen or lock
  down an existing connector without re-minting: `mcp scope claude --full`,
  `--write docs`, or `--read-only` (same flags as `mcp token`). The secret is
  unchanged, so there's nothing to re-paste; the Edge Function reads the scope
  per request, so it takes effect on the connector's next call. It's the `chmod`
  of a token.
- **On-brand MCP connector URL (`pia.tor2dbear.com/mcp`).** The connector is now
  served from PIA's own origin via a small Cloudflare Pages Function that
  reverse-proxies `/mcp/*` to the Supabase Edge Function — so an AI client shows
  PIA's favicon (not Supabase's) and the URL reads as PIA's. `mcp url` / `mcp
  token` print the new URL; the OAuth authorize form now POSTs same-origin.
  Discovery advertises whichever origin the request arrived on. The old
  supabase.co URL keeps working. (This is the app's first server-side piece —
  everything else stays static.)
- **Per-token write scopes for the `mcp` connector.** A token still reads your
  whole home, but you now choose what it may *write*: `mcp token <label>` defaults
  to `inbox/` (safe by default), `--write <dir>` widens it (repeatable; `--full`
  / `--all` is the whole home, shorthand for `--write .`), and `--read-only`
  forbids writes entirely. `mcp tokens`
  shows each token's scope, and the connector advertises a read-only token without
  the write tool at all. Run `supabase/mcp.sql` (adds `mcp_tokens.write_scope`)
  and redeploy the function.
- **`mcp` connector speaks OAuth 2.1**, so OAuth-only AI clients (Claude's custom
  connector UI, which can't take a pasted bearer token) can connect. The `mcp`
  Edge Function now also serves discovery, dynamic client registration,
  `/authorize`, and `/token` (authorization-code + PKCE). The authorize step is a
  terminal-styled page that asks for a token you minted with `mcp token` — no
  separate login, the terminal stays the source of truth. The pasted-bearer path
  is unchanged for your own scripts. Run `supabase/mcp.sql` (adds `oauth_clients`
  + `oauth_codes`) and redeploy the function.

### Changed
- **The MCP connect (authorize) page reads like a terminal prompt**, not a web
  form: `token:` with the pasted value masked inline (dots + a blinking block
  cursor) and Enter to submit — no boxed input, no visible button.

## [0.14.0] — 2026-08-08

Signing in grows up: passwordless magic-link login and lazy email verification.

### Added
- **`mcp` — the Model Context Protocol connector.** Mint a scoped bearer token
  (`mcp token <label>`, shown once) and paste it — with the connector URL
  (`mcp url`) — into an external AI client, so it can read your PIA files and
  write new ones under `inbox/` *as you*. `mcp` shows status, `mcp tokens` lists
  them, `mcp revoke <label>` cuts one off. Only the token's hash is ever stored;
  cloud account required (guests get an honest "run `login`"). Backed by a
  Supabase Edge Function over the same filesystem row the terminal uses.
- **`verify` — lazy email verification.** Signup stays frictionless (`useradd`
  logs you in immediately, no email round-trip); confirming you control your
  inbox is a separate, optional step (`verify` emails a 6-digit code, `verify
  <code>` confirms it). Arriving via a share/invite magic link verifies you
  automatically. Only needed to *accept* lists others share with you.
- **`exit`**: close the current window, like leaving a shell — with more than one
  window open it closes the active one (tmux `kill`); on the last window it's
  honest that the machine lives in a browser tab (close the tab) rather than
  pretending to quit. It's also the real escape the `:q`/`vi` eggs point at.
- **Passwordless / magic-link login**: `login <email>` with no password now emails
  a one-time sign-in link — click it to sign in, no password needed. It's also the
  recovery path for a forgotten password: sign in via the link, then `passwd` to
  set a new one. `login <email> <password>` still logs in directly. A failed
  password login now points you at it with a hint, so the recovery route is
  discoverable instead of a dead end.
- **A handful of hidden easter eggs**, in the terminal tradition and never
  advertised in `help` or Tab-completion — you have to already know the name
  (they're still reachable by `man <name>`). `xyzzy` (nothing happens), `coffee`
  (HTTP 418, a teapot — distinct from the real `brew`), `vi`/`vim`/`emacs`/`pico`
  and `:q`/`:wq`/`:x` (friendly redirects for editor muscle memory → `nano` /
  `exit`), and `ed` ("ed is the standard text editor"). The line held throughout:
  an egg never lies about the machine — PIA's `sudo` really elevates, so there's
  no fake permission-denied gag. Commands can now be marked `hidden` to stay off
  the `help` list and Tab-completion.

### Changed
- **`brew install` shows its real stages** instead of a single line: `==> Fetching
  <name>… (8.6 kB)` around the genuine chunk fetch (a real dynamic import, tagged
  with the package's **real gzip size**), `==> Registering: <commands>`, then
  `installed <name> ✓`. An honest installation ceremony — no faked progress or
  timing, and never an invented size (the size is a build-time manifest, omitted
  when unavailable). (`apt` shares it, since it's the same command.)

### Security
- **Claiming a shared-list invite now requires a verified email.** The share
  model trusts your account's email, so turning an invite addressed to it into a
  membership now requires proving you control that inbox — closing an
  interception hole where, since email confirmation is off for frictionless
  signup, registering someone else's address could claim lists shared to them.
  Personal use and signup are unaffected. Existing accounts are grandfathered.
  Run `supabase/email_verification.sql` (before re-applying `shared_lists.sql`,
  whose `claim_invites` now reads the new table).

## [0.13.0] — 2026-08-08

Shared files grow up: roles on collaborative lists.

### Added
- **Roles on shared lists** (`owner` / `editor` / `viewer`): sharing is no longer
  flat co-ownership. Invite read-only with `todo share <list> <email> --ro` (a
  viewer sees the list and live updates but can't edit or invite); `--rw` (the
  default) invites an editor. The owner manages the list — `todo members <list>`
  shows who's on it and as what, `todo unshare <list> <email>` removes someone.
  The boundary is enforced server-side (Supabase RLS + `SECURITY DEFINER` RPCs),
  so a viewer's write is refused by the database, not just hidden in the client.
  Run the updated `supabase/shared_lists.sql` to enable it (it upgrades an
  existing install in place).

## [0.12.0] — 2026-08-07

A little Unix underneath: `/etc`, real permissions, and history that persists.

### Added
- **`sudo`**: run a command elevated — it lifts the write-guard on the system
  tree for the payload, so `sudo nano /etc/hostname` or `sudo rm /etc/motd` work
  where a plain command gets `permission denied`. Single-user, so there's no
  password: it's just the deliberate "touch the system files" switch (with the
  xkcd 149 nod). Like a real shell a redirect (or pipe) is done by the shell, not
  the elevated command, so `sudo` refuses to run inside one — `sudo nano
  /etc/hostname` (not `sudo echo …>`) is how you edit a system file. While it runs
  it holds the machine (other windows wait), so an elevated edit is the only thing
  touching the system tree at a time.
- **Write-protected `/etc`**: the system tree is read-only to ordinary
  commands — `rm /etc/motd`, `echo x > /etc/hostname`, `mkdir /etc/foo` all say
  `permission denied`, like a real box. The system still seeds and refreshes it
  (elevated), your home is unaffected, and `sudo` is the escape hatch for editing
  a system file.
- **`/etc/hostname`**: the machine name behind the prompt's `{host}` now lives in
  `/etc/hostname` (like a real box). Rename your machine with
  `echo laptop > /etc/hostname` then `source ~/.pia/config`, and the prompt
  becomes `you@laptop:~$`. The default prompt template now uses `{host}` (an
  existing config with a hard-coded name still works — switch it to `{host}` to
  track the hostname).
- **`/etc` system tree**: PIA now has a little `/etc` of its own — `/etc/motd`
  (the boot greeting, now a real editable file that drives what you see at
  startup) and `/etc/os-release` (the OS identity `neofetch` echoes). `ls /`
  shows `etc/` next to `home/`. Nothing is write-protected yet; that's a planned
  next step (see `roadmap/permissions.md`).
- **`margin` config setting**: `margin = N` in `~/.pia/config` sets the breathing
  room (px) around the terminal content — top and sides — alongside `theme`,
  `font`, `font-size`, and colours. The bottom keeps its clearance for the
  on-screen key bar, and every edge is clamped up to the device safe-area so the
  value never tucks under a notch or home indicator.
- **Persistent command history**: up-arrow now reaches commands from earlier
  sessions, not just the current one. History is saved to `~/.pia/history` (the
  bash HISTFILE idiom) — so it survives a reload, syncs across your devices when
  logged in, and is shared live between `tmux` windows. Password-bearing commands
  (`passwd`, `login`, `useradd`) are kept out of it (bash HISTIGNORE), and the
  save goes through the same conflict-reconciling path as any other, so a
  concurrent edit on another device is never clobbered. `history -c` clears it.
- **`tmux` (window tabs)**: run several terminals in one page — a tmux-lite
  multiplexer. Open a window with `tmux new` or Ctrl-B c, switch with the tab
  strip or Ctrl-B n/p/1-9, close with Ctrl-B x. Windows share one machine (the
  same filesystem and account), each with its own working directory, history and
  scrollback. Windows only for now (no panes); the strip shows once you have more
  than one.
- **`whoareyou`**: the little computer introduces itself (`a little computer in
  the browser`) — a persona counterpart to `whoami` (your login), and the line
  the social-preview image shows, so it now reflects a real command.
- **"List updated" push**: when someone edits a shared checklist you're in, you
  get a push — coalesced to one summary per list (never for your own edits), so
  a flurry of ticks doesn't turn into a flurry of notifications.

### Changed
- **`demo`**: a longer, richer reel — adds a Unix search scene (`grep`/`find`), a
  full-screen `todo` checklist, and a `figlet` banner; types each command with a
  human-like rhythm; and types `clear` between scenes, leaving a fresh prompt
  behind like a real terminal instead of blanking to a black screen.
- **`changelog`**: hides Keep-a-Changelog link-reference plumbing in the terminal
  (it's GitHub-only), so the version list stays clean instead of trailing raw
  `[x]: url` lines.

### Fixed
- **`piano` on iOS**: notes now sound on iPhone/iPad — resume the audio context
  before scheduling (Safari creates it suspended), and opt into the "playback"
  audio session so the Ring/Silent switch no longer mutes it.

## [0.11.0] — 2026-07-25

Honesty, discoverability, and a retro boot.

- **`notify on/off`**: turn push notifications on or off per device — the off
  switch that was missing. `off` also unsubscribes the browser and forgets the
  device's stored subscription (your other devices stay subscribed).
- **Discoverability**: an unknown package command now suggests how to get it
  (`brew install <package>`, naming the package even when it differs from the
  command); the boot greeting points at `demo`, `tutor`, and `man pia`; and
  `man` + `tutor` come preinstalled so those pointers work on the first run.
- **`bios`**: an opt-in retro BIOS/POST boot sequence — a power-on self-test
  before the prompt. Skippable, off by default, and honours reduced-motion.
- **Safer cloud sync**: editing the same account on two devices no longer
  silently overwrites. The newer version wins and your unsynced changes are set
  aside under `~/.pia/conflicts/` instead of vanishing.
- **`changelog`**: shows the latest release by default now, with `--all` (paged)
  for the full history — so it stays readable as it grows.
- **Under the hood**: the server's reminder cron engine is guarded against
  drifting from the client's copy, and a flaky test was made deterministic.

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

[Unreleased]: https://github.com/tor2dbear/pia-terminal/compare/v0.15.0...HEAD
[0.15.0]: https://github.com/tor2dbear/pia-terminal/releases/tag/v0.15.0
[0.14.0]: https://github.com/tor2dbear/pia-terminal/releases/tag/v0.14.0
[0.13.0]: https://github.com/tor2dbear/pia-terminal/releases/tag/v0.13.0
[0.12.0]: https://github.com/tor2dbear/pia-terminal/releases/tag/v0.12.0
[0.11.0]: https://github.com/tor2dbear/pia-terminal/releases/tag/v0.11.0
[0.10.0]: https://github.com/tor2dbear/pia-terminal/releases/tag/v0.10.0
