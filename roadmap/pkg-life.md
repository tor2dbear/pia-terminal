---
title: paket: life — Conways livsspel
status: done
tags: [packages, games]
updated: 2026-07-18
---

## Mål
`life` — Conways Game of Life. Screen-app: rutnät, tick-loop, seed-mönster
(glider m.m.), pausa/stega. Ren grid-logik (testbar). Insats: S–M.

## Levererat
`brew install life`. Ren `Life`-klass: begränsat rutnät (kanter döda), B3/S23-
regler i `step()`, `randomize(rng, density)`, `population()`. Enhetstestat
(block står still, blinker oscillerar period 2, ensam cell dör, densitet 0/1).
Screen-appen seedar slumpmässigt och stegar på en timer: `space` pausar, `s`
stegar en generation, `r` seedar om, `^X` avslutar.
