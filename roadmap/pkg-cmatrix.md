---
title: paket: cmatrix — matrix-regn
status: done
tags: [packages, fun]
updated: 2026-07-18
---

## Mål
`cmatrix` — grönt tecken-regn (Matrix). Screen-app, animerad, ^X avslutar.
Injicerbar rng för test. Insats: S.

## Levererat
`brew install cmatrix`. Ren `MatrixRain`-simulering: varje kolumn kör en droppe
vars huvud faller en rad per tick och lämnar ett ändligt spår; klarad botten →
kolumnen respawnar. Injicerbar rng → deterministisk under test. Screen-appen
renderar rutnätet i en enfärgad grön `<pre>` (CSP-säker `textContent`, glöd via
`text-shadow`). `q`/Escape/`^X` avslutar. Enhetstest (tomt vid start, huvuden
avancerar, determinism för fast seed).
