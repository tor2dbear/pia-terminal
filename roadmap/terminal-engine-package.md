---
title: Lyft ut terminal-motorn som fristående paket
status: now
tags: [terminal, packaging]
updated: 2026-07-18
---

## Mål
(Research, inte beslutat.) Plocka ut PIA:s terminal-/shell-motor — command
registry, pipe-parsing, screen-app-host — som ett fristående, beroendefritt
paket andra kan `npm install`:a och bygga egna små webb-skal på. "Ugnen istället
för pizzan."

## Research
- **Nischen är inte tom.** Etablerade libs finns redan: **jQuery Terminal**
  (moget, men kräver jQuery), **javascript-terminal** (närmast idén: filsystem +
  command-mapping + autocomplete + history), Ptty m.fl. (`xterm.js` är en annan
  sak — ritar en riktig pty, är inget skal.) Så "släpp den och folk strömmar
  till" är osannolikt. Gå in med rätt förväntan.
- **Vad som skiljer PIA:s motor:**
  1. Noll beroenden, modern TS/ESM (de andra är jQuery-baserade eller äldre).
  2. **Screen-app-host** (`ScreenApp` i `screen.ts`): lämna över hela skärmen
     till en app och återställ, med mobil-tangentbar. Mest distinkta
     återanvändbara biten — de flesta libs är bara rad-in/rad-ut.
  3. Adapter-sömmen: utbytbar storage/auth bakom interface. Ingen av de andra
     har "ta med ditt eget moln-backend" som förstklassig idé.
- **Redan halvvägs:** `registry.ts` och `parse.ts` är rena (ingen DOM);
  kommandon rör bara `CommandContext` (ett interface), aldrig skärmen → själva
  körmodellen är redan renderar-oberoende. Allt DOM-trassel bor i *en* fil
  (`terminal.ts`). "Lyft ut motorn" = separera den DOM-renderaren från logiken
  som redan står fri. Uppdelning, inte omskrivning.
- **Testet på om gemet är på riktigt:** dra en ren gräns motor/demo och bygg en
  *andra* pytteliten sak på samma motor. Går det smärtfritt → paketet finns.

### Ärlig verdikt
Gör det för **portfolio/hantverk**, inte för att bli ett populärt paket. Ett
rent, dokumenterat, testat litet bibliotek — plus "jag byggde två saker på samma
motor" — är en starkare portfolio-story än appen ensam. Men räkna med en fin
artefakt, inte en hit.

## Öppna frågor
- Värt det jämfört med MCP-connectorn (se `ai-mcp-context`)? Båda är aktuella och
  on-brand; välj efter vad som lockar mer — djup (motor) eller aktualitet (MCP).
- Exakt paketgräns: vad flyttar (registry, parse, screen-interface, en headless
  runner) och vad stannar som PIA-specifik referens-renderare?
- Namn/scope om det publiceras; licensval.

## Boundary-karta (uppmätt 2026-07-18)
Av ~37 källfiler är bara **12** DOM-bundna; resten är redan ren motor.
- **Ren motor (DOM-fri, lyft nästan som den är):** `parse.ts`, `glob.ts`,
  `registry.ts`, hela `vfs/`, alla `commands/*`, de rena renderarna i `pia/`
  (markdown/json/table), `share/*`, adapter-*interfaces*.
- **Renderare (skärm-bunden, men redan parametriserad):** `terminal.ts` — tar
  in `{vfs, adapter, registry, auth, session, share}` via konstruktorn. Kopplad
  till PIA via `pia/rc` (config) + `pia/themes` (tema) + `ShareStore` — det som
  ska injiceras bort i steg 2.
- **PIA-specifikt (stannar):** teman, config, delning, boot, konkreta adaptrar,
  `main.ts`-wiringen.

Den enda riktiga design-frågan: `CommandContext` blandade motor-verktyg med
PIA:s egna. Löst genom att dela den (se plan, steg 1).

## Plan
1. **Dela `CommandContext`** i `CoreCommandContext` (motor) + `CommandContext`
   (PIA:s tillägg). Ren typ-ändring. — **klart** (PR #19).
2. **Lossa renderaren:** injicera tema/config i `terminal.ts` istället för direkt
   `pia/rc`/`pia/themes`-import. — **klart**. `terminal.ts` importerar ingen
   `pia/`-modul längre; en `configure`-option ger prompt+alias (och applicerar
   temat), PIA:s glue bor i `pia/terminalConfig.ts` och injiceras i `main.ts`.
3. **`engine/`-mapp + publik `index.ts`** (motorns API-yta) — **klart** (PR #21).
   `src/engine/index.ts` re-exporterar den återanvändbara ytan (command-modell,
   parser, globbing, screen-app-interface, `Terminal`, VFS, adapter-*interfaces*)
   bakom en dörr; ett smoke-test importerar *bara* genom den.
4. **Bevisa med en andra app** — **klart** (PR #22). `src/examples/adventure/`
   är ett litet textäventyr byggt *bara* på `engine/`:s publika API: egna
   kommandon (`look`/`go`/`take`/`inventory`), egna minimala adapter-impl
   (null-storage/-auth), noll av PIA:s kommandon/teman/config. Fyra tester
   spelar igenom det genom motorns `Terminal`. Tree-shakas bort ur PIA:s bundle.
   → **Gemet-testet passerat: motorn bär en helt annan app.**
5. **Öppningsbar sida** — **klart**. Äventyret körs nu som en egen sida
   (`/adventure/`) via vite multipage (`rollupOptions.input`: `main` + `adventure`).
   Bygget bekräftar poängen: motorn blir en *delad chunk* (`assets/terminal-*.js`,
   ~23 kB) som **båda** sidorna använder — inte en kopia per app. Sidan renderar i
   riktig webbläsare under PIA:s strikta CSP utan runtime-/CSP-fel (där Python-spiken
   föll). Så motorn syns nu, inte bara testas.
6. **Kvar (polish, ej brådskande):**
   - Full genericisering (`Command<Ctx>`/`Terminal<Ctx>`) så en app slipper skicka
     oanvänd `vfs`/`auth`/`adapter` — idag passerar äventyret stubs.
   - Paketera `engine/` som npm.

_Status `now`. Litet, säkert steg i taget; varje steg håller alla tester gröna._
