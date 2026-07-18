---
title: less / more — bläddra i lång output
status: done
tags: [terminal, commands]
updated: 2026-07-17
---

## Mål
En pager: `less <fil>` (eller `... | less`) låter dig bläddra i innehåll istället
för att det flödar förbi. Idag floodar lång output skärmen.

## Research
- **Passar screen-app-hosten perfekt.** En pager är precis en `ScreenApp` (som
  `nano`/`snake`): ta över skärmen, visa en sida, bläddra med piltangenter/
  space/`q` för att avsluta. Ingen ny arkitektur — `ctx.runApp()` finns.
- Läser fil *eller* piped stdin. Piped in i en pager kräver att stdin når appen
  (kontrollera hur `piped`/`stdin` levereras till en screen-app).
- Idiom: `less` (bakåt+framåt, `/`-sök, `q`), `more` (bara framåt) som enklare
  alias/variant. Mobil: hosten har redan tangentbar — space/pil/`q` som knappar.
- Naturlig koppling: `man`-sidor (om de nånsin byggs) skulle visas *genom* pagern.

## Öppna frågor
- Hur mycket av `less`? Börja med sida upp/ner + `q`; `/`-sök och `g`/`G` sen.
- Ska långa kommando-outputs *automatiskt* gå genom en pager, eller bara explicit
  `less`? Explicit först — auto-paging är en större beteendeändring.
- stdin → screen-app: verifiera att pipe-innehåll når appen innan vi lovar
  `... | less`.

## Levererat
Ny `Pager`-`ScreenApp` (`src/apps/pager.ts`) + `less`-kommando (alias `more`).
- **Bläddring:** Space/`f`/PageDown en sida ner, `b`/PageUp upp, ↑↓/`j``k` en
  rad, `g`/`G` till start/slut, `q`/Esc avslut. Skrivbara tangenter via `onText`,
  special via `onKey` — varje tangent hanteras på *ett* ställe (verifierade
  terminalens dispatch).
- **Modell testbar utan DOM:** windowed render (`top`/`rows`), `render()` guardad
  när ej mountad, `snapshot()`/`visible()` för test — som `snake`. Sidstorlek
  default 20, mäts från viewporten i browsern (`fitRows`, faller tillbaka
  headless).
- **stdin:** läser fil-arg *eller* `ctx.stdin`, så `cat stor.log | less`
  komponerar (less är sista steget → ej capturead → `runApp` funkar). Capturead
  (`less foo | grep`) → passerar innehållet rakt igenom istället.
- **Chrome:** återanvänder editorns `.ed-*`-layout (title/scroll-body/status),
  ingen ny CSS.

Täckt av 7 app-tester (sidor/rader/ändar/avslut/render) + 2 kommandotester
(saknad fil, piped pass-through). 300 tester gröna; typecheck + build gröna; boot
verifierad i headless Chromium.

_`/`-sök, auto-paging av lång output, och `man` ovanpå pagern kvar som uppföljning._
