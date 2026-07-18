# PIA — Personal Integrated Applications

A standalone web terminal: a little computer in the browser. TypeScript + Vite +
Vitest, deployed static to Cloudflare Pages. Named after Pia (backronym à la
Apple's Lisa).

## Design principle: terminal-idiom first

Every command and flow should follow Unix/shell convention — command **names**,
**flags**, and **behaviour**. Prefer the real terminal name (`nano`, `useradd`,
`grep -n`) over friendly/web coinages (`edit`, `register`, GUI shortcuts). Keep
friendly names as **aliases** where helpful, not as the primary.

**When a flow has no terminal equivalent — flag it and sync before building.**
Examples we've already hit: email + password + email-confirmation auth (pure
web), `share`/`publish` returning URLs, on-screen touch controls for mobile,
`todo share <name> <email>` / invite-by-email collaboration (closest Unix kin is
`chmod`/`chown`/NFS-mounts — decided as an accepted web divergence), and
`upload`/`download` reaching the OS file picker / triggering a browser download
(no shell equivalent for touching the real desktop; named plainly rather than
faking `scp`/`get`/`put`).
These are allowed, but call them out so the divergence is a decision, not a
drift. Touch affordances (D-pad, tappable ^O/^X) are intentional mobile
concessions, not lingo.

Idiom notes in force: editor is `nano` (alias `edit`), saves with `^O`
(WriteOut) and exits with `^X`; account creation is `useradd` (alias
`register`); the prompt is `user@pia:~$`; config lives in a `.pia/` dotfile.

## Architecture (keep it this way)

- **Adapters are the seam.** The terminal never touches storage or auth
  directly — only `StorageAdapter` / `AuthAdapter` / `ShareStore` interfaces.
  This is why the backend was a *swap, not a rewrite*: `Local`/`Fake`/`Null` for
  guests, Supabase for logged-in users, behind the same interfaces. Don't bypass
  them. Collaboration rides the same seam: `ShareStore` (shared checklists) has a
  `Null` (guest), `Memory` (test), and `Supabase` implementation.
- **Command registry.** Each command is `{ name, help, run(args, ctx), aliases? }`.
  Commands reach the world only through `CommandContext` (print, vfs, auth,
  stdin, piped, runApp, …) — never the DOM or storage.
- **Screen-app host.** Full-screen apps (editor, snake) implement `ScreenApp`
  and take over via `ctx.runApp()`. New games/apps are "just another screen app".
- **VFS** is an in-memory tree serialized by the storage adapter.

## Layout

```
src/vfs/        filesystem tree + path resolution
src/storage/    StorageAdapter + Local/Memory
src/auth/       AuthAdapter + Fake/Memory
src/share/      share.ts (URL sharing) + store.ts (ShareStore + Null/Memory)
src/supabase/   cloud adapters (dynamic-imported; dormant without config)
src/commands/   registry + commands (fs, system, edit, auth, text, games)
src/apps/       screen apps (editor, snake, todo)
src/terminal/   terminal core (input, cursor, history, Tab, pipes) + app host
roadmap/        one markdown file per planned item ("puck") — see roadmap/README.md
```

## Roadmap

Planned work lives in `roadmap/` as one markdown file per item ("puck"), each
with YAML frontmatter (`title`, `status`, `updated`, …) and free-form body for
goal/research/open questions. Status flows `inbox → now / next / later → done`.
Read `roadmap/README.md` for the full convention. When you start on a puck set
its `status: now` and link the working `issue:`; new undecided ideas go in
`inbox`. The format is designed to be harvested by an external multi-repo
overview site, so keep frontmatter field names and status values exactly as
specified.

## Conventions

- **Language:** app UI, code, comments, and commit messages in **English**;
  chat with the user in **Swedish**.
- **Tests:** Vitest. Run `npm run typecheck && npm test && npm run build` before
  shipping. Prefer driving real behaviour (jsdom terminal, injected rng) over
  shallow unit tests.
- **Verify in a real browser** when practical: `--dump-dom` boot checks catch
  runtime errors the tests can't.
- **Deploy:** Cloudflare Pages builds on push to `main` (`npm run build` →
  `dist/`) and serves the custom domain (`pia.tor2dbear.com`) over HTTPS; every
  PR gets its own preview URL. Work lands via **branch → PR → CI → merge**:
  `.github/workflows/ci.yml` runs typecheck + tests + build on each PR (required
  by branch protection on `main`). Security headers — CSP, `frame-ancestors`,
  `X-Frame-Options`, … — ship in `dist/_headers`, emitted at build time by the
  `vite.config.ts` CSP plugin (Cloudflare Pages serves them; a matching `<meta>`
  CSP covers any static host).
- **Cloud config** lives in committed `.env.production` (public client keys; RLS
  is the security boundary). Absent → app is fully local and Supabase is
  tree-shaken out.
