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

## Kom igång (implementation)

**Live:** https://tor2dbear.github.io/pia-terminal/ — publiceras automatiskt av
GitHub Pages vid varje push till `main` (`.github/workflows/deploy.yml` kör
typecheck + tester som grind innan bygget läggs upp).

Kärnan (Nivå 0) är scaffoldad och körbar.

```bash
npm install
npm run dev        # starta dev-servern (Vite + HMR)
npm test           # kör testsviten (Vitest)
npm run typecheck  # typkontroll utan bygge
npm run build      # produktionsbygge till dist/
```

### Varför TypeScript + Vite (och inte vanilj JS)?

Arkitekturen vilar på **kontrakt** — `StorageAdapter`/`AuthAdapter` är interfaces
och varje kommando är ett typat `{ name, help, run(args, ctx) }`. TS upprätthåller
de kontrakten åt oss, så backend-steget blir ett *byte, inte en omskrivning*. Vite
följer nästan gratis (kör TS + ger HMR för snabb finjustering av boot/markör/färg).

### Kodstruktur

```
src/
  vfs/          virtuellt filsystem (träd + sökvägsupplösning)
  storage/      StorageAdapter-interface + LocalStorage/Memory-implementationer
  commands/     command registry + Nivå 0-kommandon (fs.ts, system.ts)
  terminal/     terminal-kärnan (input, markör, history, Tab) + input-parser
  boot.ts       boot-sekvens
  main.ts       entry point (kopplar ihop allt)
```

### Vad som finns (Nivå 0)

Kommandon: `help` · `whoami` · `echo` · `clear` · `neofetch` · `pwd` · `ls` ·
`cd` · `mkdir` · `touch` · `cat` · `rm` · `mv`. Blinkande blockmarkör,
command-history (pil upp/ner), Tab-komplettering (kommandon + sökvägar),
boot-sekvens, och persistens via `LocalStorageAdapter`. 37 tester täcker VFS,
parser, kommandon och den tangentbordsdrivna terminalen.

### Nästa steg

`edit` (mini-editor) · `AuthAdapter` med riktig fejk-login · tema-växling/config.
Se roadmap ovan — härifrån är det mesta "ännu ett kommando".