---
title: paket: tetris
status: done
tags: [packages, games]
updated: 2026-07-18
---

## Mål
`tetris` — screen-app-spel: fallande tetrominoer, rotation, radrensning, nivåer.
Ren grid-/kollisions-logik med injicerbar rng (testbar). Insats: M.

## Levererat
`brew install tetris`. Ren, huvudlös `Tetris`-klass: 10×20-brunn, alla sju
tetrominoer ur en blandad 7-bag (injicerbar rng), rotation med enkel wall-kick,
gravitation, radrensning och poäng/nivåer. Fullt enhetstestat (spawn, radrensning
+ poäng, flytt/rotation i brunnen, väggkollision, game over när stacken når
toppen, deterministisk bag för fast seed). Screen-appen renderar en snapshot och
äger inga regler själv: pilar flyttar/roterar, `↓` mjukdropp, `space` hårddropp,
`^X` avslutar, `Enter` startar om vid game over. D-pad för mobil.
