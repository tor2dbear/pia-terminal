---
title: "Fönster-flikar — tmux-lite multiplexer"
status: done
tags: [terminal, ux]
updated: 2026-07-30
---

## Mål
Flera sessioner i samma Pia-flik. Man *kan* redan öppna flera browserflikar, men
native ger delat *live*-minne (skrivning i ett fönster syns direkt i ett annat,
utan localStorage-race eller reload), direkt nytt fönster utan sidladdning, och
tmux-känslan. Portfolio-vinkeln: en multiplexer bevisar att terminalkärnan är rent
multi-instansierbar (samma poäng som motor-extraktionen).

## Levererat (2026-07-30)
Byggt som **tmux-lite**. Beslut:
- **Rätt idiom = tmux, inte emulator-flikar.** En dator, flera *fönster*.
- **Delad VFS (en dator).** Alla fönster delar samma tjänster (VFS, adapter,
  registry, konto); varje fönster är en egen `Terminal` med egen `cwd`, historik,
  scrollback och ev. körande screen-app. `Terminal` var redan per-instans (egen
  input, egen scroll-container, `dispose()`), så det här är bara ett skal —
  `TabManager` i `src/terminal/tabs.ts`.
- **Bara första fönstret bootar.** Nya fönster (`tmux new` / Ctrl-B c) är rena
  shells på samma maskin.
- **Yta:** tmux-prefix `Ctrl-B` (obundet i Pias readline) + `c`/`n`/`p`/`x`/`1-9`,
  och en synlig flik-strip. Prefix-tangenterna är Unix-idiomet; **strippen är en
  GUI/emulator-eftergift** (accepterad web-divergens, som on-screen-key-baren) och
  är också touch-vägen. Plus ett `tmux`-kommando (alias `tab`) för upptäckbarhet
  och mobil (`tmux new/next/prev/kill/<n>`).
- **Strippen visas bara med >1 fönster** — ingen chrome i default-läget.
- **Fokus-routing gratis:** bara det synliga fönstrets input är fokuserbar, så
  tangenttryck når alltid det aktiva fönstret.
- **Layout:** `#screen` blev en flex-kolumn; varje `.term-pane` ärver det gamla
  `#screen`:s scroll + safe-area-padding (terminalen scrollar sin root).

## Härdat (Codex-rundor)
Multi-fönster reste flera verkliga kanter som åtgärdades: re-home av alla
fönster vid konto­byte (delad session/VFS), `dispose()` avbryter kommando + löser
`runApp`-löftet (så command-cleanup körs), stäng-vakt mot att stänga ett fönster
mitt i ett kommando (utom `tmux kill` som stänger sitt eget), schemaläggning till
ett *ledigt* fönster, och ett **cross-window transition-lås**: konto­byten vägrar
om ett annat fönster är upptaget och blockar nya kommandon i andra fönster medan
login/logout pågår — så inget kommando skriver in i fel konto under VFS-swappen.
Tab-strippen är tangentbords­manövrerbar (riktiga `<button>` + `click`).

## Kända v1-begränsningar (medvetet dragen gräns)
Kvar finns bara ultra-sällsynta concurrency-kanter som kräver *avsiktliga,
nästintill samtidiga* motstridiga handlingar i två fönster. Bedömdes som
oproportionerligt att stänga för en portfolio-v1 (kräver schemaläggar-omskrivning
resp. app-intern async-avbrytning):
- **Schemalagt jobb mitt i ett konto­byte:** ett `at`/cron-jobb som blir due exakt
  medan ett annat fönster kör login/logout avvisas av låset och tappas (redan
  borttaget ur kön).
- **Python-REPL stängd mitt i en beräkning under ett konto­byte:** stäng ett
  fönster vars Python fortfarande räknar, samtidigt som ett annat loggar in →
  resultatet kan skrivas mot fel konto (app-intern async som `isRunningCommand`
  inte ser).
- **`asyncCmd; tmux kill` + fönsterbyte:** binder mot aktivt index, inte det
  anropande fönstret, så fel fönster kan stängas om man byter mitt i kedjan.
- **Mobil viewport med strip + tangentbord:** panens höjd sätts till hela
  visual-viewporten fastän strippen ligger ovanför (kan skjuta botten under
  key-baren i det ovanliga multi-fönster-på-mobil-läget).

## Uppskjutet (medvetet)
- **Paner/splits** — ett helt annat layoutproblem.
- **Persistera layouten** i `.pia/` (detach/attach-känsla).
- **Pausa bakgrundsappar** (t.ex. snake-timer i inaktiv flik).

_Ny puck den här sessionen; byggd direkt. Följer `roadmap/README.md`-konventionen._
