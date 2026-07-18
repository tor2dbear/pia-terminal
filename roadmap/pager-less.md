---
title: less / more — bläddra i lång output
status: inbox
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

_Ligger i `inbox`. Låg arkitektur-risk (screen-app finns), men scope-frågan öppen._
