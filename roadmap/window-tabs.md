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

## Uppskjutet (medvetet)
- **Paner/splits** — ett helt annat layoutproblem.
- **Persistera layouten** i `.pia/` (detach/attach-känsla).
- **Flik-etikett följer cwd live** — just nu uppdateras den vid fönsterbyte, inte
  mitt i en `cd` (kosmetiskt; tmux döper inte heller om fönster automatiskt).
- **Pausa bakgrundsappar** (t.ex. snake-timer i inaktiv flik).

_Ny puck den här sessionen; byggd direkt. Följer `roadmap/README.md`-konventionen._
