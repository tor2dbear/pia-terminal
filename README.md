# PIA — projektspec

> **PIA** — *Personal Integrated Applications*. Namnet är spikat (döpt efter Pia);
> backronymen i Apple Lisa-andan.
> En fristående webbterminal. Helt frikopplad från portfolion — eget repo, egen app.

Detta dokument är fröet till projektet. Det sammanfattar vad vi bollat fram och är
tänkt att läsas i början av nästa session innan vi rör en rad kod.

---

## Vad det är

En terminal i webbläsaren som beter sig som en riktig liten dator. Man kan skapa
och redigera textfiler, navigera ett filsystem, logga in, och köra kommandon — allt
på ett terminaltroget sätt. En egen liten värld, inte en Unix-emulator på riktigt,
men med tillräckligt av känslan för att kännas äkta.

Det är en **riktig mini-app**, inte bara en portfolio-gimmick.

---

## Beslut (spikade)

| Fråga | Val |
|-------|-----|
| Själ | Riktig mini-app (verktyg med konton och sparade dokument) |
| Lagring | **Starta klientsida** (localStorage), **backend som mål** |
| Rendering | **Egen lättviktig** terminal-renderer (DOM/Canvas) — ingen xterm.js |
| Språk | **TypeScript** |
| Byggverktyg | Vite |
| Tester | Vitest |
| Deploy | Statisk sida först (Netlify/Vercel/valfritt), backend-steg senare |
| Personlighet | Lutar åt "diskret värd" — en namngiven AI som hälsar vid boot och svarar torrt ibland. Ej spikat. |

**Öppna frågor att bestämma tidigt:**
- Namn på appen/personan.
- Estetik: ren modern terminal vs. retro CRT (scanlines, glöd, boot-brus).
- Prompt-tecken: klassiskt `$` eller något eget.
- Editor: helskärms mini-editor (nano-stuk) vs. enkel inline-inmatning.

---

## Arkitektur

Målet är att backend-steget ska bli ett **byte, inte en omskrivning**. Det uppnås
genom adaptrar mellan appen och lagringen. Terminalen rör aldrig `localStorage`
direkt — den pratar med ett interface.

```
┌─────────────────────────────────────────────┐
│  Terminal-kärna (input, markör, history,     │
│  Tab-komplettering, utskrift, rendering)     │
├─────────────────────────────────────────────┤
│  Command registry                            │
│  { name, help, run(args, ctx) }              │
├─────────────────────────────────────────────┤
│  VFS (virtuellt filsystem — träd i minnet)   │
├─────────────────────────────────────────────┤
│  Adaptrar (interface):                        │
│   • StorageAdapter → filer läs/skriv          │
│   • AuthAdapter    → login/logout/whoami      │
│                                               │
│  Steg 1: LocalStorageAdapter / FakeAuth       │
│  Steg 2: ApiAdapter / RealAuth (samma API)    │
└─────────────────────────────────────────────┘
```

### De tre bärande delarna

1. **VFS (virtuellt filsystem)** — ett träd av mappar/filer i minnet, serialiserat
   via `StorageAdapter`. Grunden för `ls`, `cd`, `mkdir`, `touch`, `cat`, `rm`, `mv`, `pwd`.
2. **Command registry** — varje kommando är ett litet objekt `{ name, help, run(args, ctx) }`.
   Gör det trivialt att lägga till nya kommandon och att auto-generera `help`.
3. **Terminal-kärna** — input-rad med blinkande markör, history (pil upp/ner),
   Tab-komplettering, utskrift. Egen DOM-rendering för full designkontroll.

**Bärande princip:** bygg kärnan (VFS + kommandon + editor) rock-solid. Allt
annat — spel, appar, delning, AI — är bara "ännu ett kommando" ovanpå den. Ju
stabilare kärna, desto billigare blir varje ny idé.

**Designprincip — terminal-idiom först:** varje kommando/flöde ska följa
Unix/shell-konvention (namn, flaggor, beteende). Föredra riktiga terminalnamn
(`nano`, `useradd`, `grep -n`) framför vänliga/web-myntade (`edit`, `register`) —
behåll de vänliga som *alias*. **När ett flöde saknar terminal-motsvarighet
(t.ex. e-post + lösenord + bekräftelse, `share`→URL, touch-kontroller): flagga
det och synka innan vi bygger** — så blir avvikelsen ett beslut, inte en drift.
(Se `CLAUDE.md` för den fulla regeln.)

---

## Ambitionsnivåer (roadmap)

### Nivå 0 — Kärnan (MVP, klientsida)
`help` · `whoami` · `login`/`logout` (fejk) · `ls` · `cd` · `pwd` · `mkdir` ·
`touch` · `cat` · `edit <fil>` · `rm` · `clear` · history + Tab-komplettering ·
boot-sekvens · ett tema.

Räcker för att kännas som en riktig liten dator.

### Nivå 1 — "En riktig liten dator"
- Fler filtyper: `.md` renderas, `.json` syntaxfärgas, `.csv` som tabell.
- Pipes & operatorer: `cat notes.txt | grep todo`, `ls > filer.txt`.
- Sök: `grep`, `find`.
- Alias & config: en `.v/config`-fil användaren själv redigerar (teman, prompt, alias).
- Export/import: ladda upp riktig fil från datorn in i VFS, eller ladda ner ut.

### Nivå 2 — Appar inuti terminalen
Varje "app" är ett kommando som tar över skärmen:
- `edit` — nano/vim-lik editor med statusrad.
- `draw` — ASCII/pixel-ritverktyg.
- `music` — liten tracker/step-sequencer via Web Audio.
- `paint` — färglägg med ANSI-färger.
- `present` — bildspel byggda av textfiler.
- Spel: `snake`, `2048`, `tetris`, textadventyr-motor.

### Nivå 3 — Riktigt system (backend)
- Konton på riktigt (registrering, filer som följer mellan enheter).
- `share <fil>` → publik länk i terminal-läge.
- `publish <mapp>` → `.md`-filer blir en liten publik sida.
- Multiplayer: `who`, `msg`, gemensamma rum (BBS-vibe).
- `remind` / schemalagt.

Trolig stack: Netlify/Vercel Functions + Supabase (Auth + Postgres, gratisnivå).

### Nivå 4 — Drömmål
- Riktig kod-exekvering i sandbox via WebAssembly (Pyodide): `python script.py`.
- Fjärr-API:er: `weather`, `wiki`, `translate`.
- `ask <fråga>` — AI-kommando som svarar i terminalen (knyter an till AI-värd-personan).
- CRT/retro-mode, boot-BIOS — ren estetik, men det folk delar vidare.

> **Nivå 5 (portfolio-som-terminal) är medvetet struken** — detta projekt är helt
> frikopplat från portfolion.

---

## Föreslagen startordning för nästa session

1. Scaffolda Vite + TypeScript + Vitest.
2. Bygg terminal-kärnan: input-rad, markör, utskrift, history, Tab.
3. Bygg VFS + `StorageAdapter`-interface med `LocalStorageAdapter`.
4. Bygg command registry + Nivå 0-kommandon.
5. Bygg `edit` (mini-editor).
6. `AuthAdapter` med fejk-login.
7. Tema + boot-sekvens.
8. → Härifrån är resten bara fler kommandon.

---

## Terminalkänsla (designnoteringar)

Blinkande blockmarkör · omsorgsfull monospace (JetBrains Mono / Berkeley Mono-vibe) ·
scanline/CRT-filter som tillval · boot-sekvens vid load · ljud-toggle för
tangenttryck · en `neofetch`-ruta med egen logga.

Exempel på boot:

```
PIA v0.1
Personal Integrated Applications
hej. skriv 'help' för att börja.

user@pia:~$ ▮
```

---

## Getting started (implementation)

> Note: the app UI is in English. The design spec above is still in Swedish.

**Live:** https://tor2dbear.github.io/pia-terminal/ — deployed automatically by
GitHub Pages on every push to `main` (`.github/workflows/deploy.yml` runs
typecheck + tests as a gate before publishing the build).

The core (Level 0) is scaffolded and runnable.

```bash
npm install
npm run dev        # start the dev server (Vite + HMR)
npm test           # run the test suite (Vitest)
npm run typecheck  # type-check without building
npm run build      # production build to dist/
```

### Why TypeScript + Vite (not vanilla JS)?

The architecture rests on **contracts** — `StorageAdapter`/`AuthAdapter` are
interfaces and every command is a typed `{ name, help, run(args, ctx) }`. TS
enforces those contracts for us, so the backend step becomes a *swap, not a
rewrite*. Vite follows almost for free (runs TS + gives HMR for quickly tuning
the boot sequence, cursor, and colors).

### Code layout

```
src/
  vfs/          virtual filesystem (tree + path resolution)
  storage/      StorageAdapter interface + LocalStorage/Memory implementations
  auth/         AuthAdapter interface + Fake/Memory implementations
  commands/     command registry + all commands (fs, system, edit, auth, text, games)
  terminal/     terminal core (input, cursor, history, Tab, pipes) + screen-app host
  apps/         full-screen apps (editor, snake)
  boot.ts       boot sequence
  main.ts       entry point (wires everything together)
```

### What exists

Commands: `help` · `whoami` · `echo` · `clear` · `neofetch` · `pwd` · `ls` ·
`cd` · `mkdir` · `touch` · `cat` · `rm` · `mv` · `nano` · `login` · `useradd` ·
`usermod` · `logout` · `grep` · `find` · `wc` · `snake`. (`edit`→`nano`,
`register`→`useradd` are aliases.) With a backend, `useradd <username> <email>
<password>` picks a real username (stored as account metadata); `usermod
<username>` renames you and moves your home directory.

- **Terminal core:** blinking block cursor, command history, Tab-completion
  (commands + paths), a soft-keyboard capture field for mobile.
- **Pipes & redirects:** `a | b | c`, `> file`, `>> file` — commands have real
  stdin/stdout; `grep`/`find`/`wc` read files or piped input.
- **Screen apps** (via the app host): `nano` (^O save, ^X exit) and `snake`
  (arrows/WASD, on-screen D-pad) — both fully playable on a phone.
- **Fake auth** with per-user home directories (`AuthAdapter`), the boot
  sequence, and persistence via `LocalStorageAdapter`.

89 tests cover the VFS, parser + pipelines, commands, auth, the keyboard-driven
terminal, the editor, the snake game logic, and the Supabase adapters.

Level 0 is complete; Level 1 (pipes, grep/find) and the first Level 2 screen-app
game are in.

### Backend (Supabase) — live

Real accounts (`register`/`login <email> <password>`) and files that follow you
between devices. Guests stay on localStorage; logged-in users get cloud storage
(`HybridStorageAdapter`). The cloud path loads via dynamic import, so
`supabase-js` is a lazy chunk — the base bundle never pays for it.

Config lives in the committed [`.env.production`](.env.production) — the URL and
the Supabase **publishable** key. These are client-side keys that ship in the
public bundle regardless; **Row-Level Security** (see
[`supabase/schema.sql`](supabase/schema.sql)) is what protects the data. With no
config present the app falls back to fully local (guest) mode and Supabase is
tree-shaken out.

Note: the app expects email confirmation to be **off** (Authentication →
Sign-in → Email) so `register` logs you straight in; otherwise it tells you to
confirm via the email link first, then `login`.

### Next steps

`share <file>` / `publish <folder>` (needs the backend) · theme switching /
config · more Level 2 apps (`2048`, `draw`) · `.md` rendering.