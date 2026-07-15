# Webterminal — projektspec

> Arbetsnamn: **VERA** (ej spikat — kan bli `ODEN`, `torOS`, eller annat).
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
VERA v0.1
hej. skriv 'help' för att börja.

user@vera:~$ ▮
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
  commands/     command registry + Level 0 commands (fs, system, edit)
  terminal/     terminal core (input, cursor, history, Tab) + screen-app host
  apps/         full-screen apps (editor)
  boot.ts       boot sequence
  main.ts       entry point (wires everything together)
```

### What exists (Level 0)

Commands: `help` · `whoami` · `echo` · `clear` · `neofetch` · `pwd` · `ls` ·
`cd` · `mkdir` · `touch` · `cat` · `rm` · `mv` · `edit` · `login` · `logout`.
Blinking block cursor, command history (arrow up/down), Tab-completion (commands
+ paths), a soft-keyboard capture field for mobile, a full-screen `edit`or (^S
save, ^X exit, tappable on mobile), fake auth with per-user home directories
(`AuthAdapter`), the boot sequence, and persistence via `LocalStorageAdapter`.
52 tests cover the VFS, parser, commands, auth, the keyboard-driven terminal,
and the editor.

Level 0 is complete.

### Next steps

Theme switching / config · Level 1 goodies (`grep`/`find`, pipes, `.md`
rendering) · a first Level 2 screen-app (a game). Backend (Level 3) swaps
`LocalStorageAdapter`/`FakeAuthAdapter` for Supabase behind the same interfaces.