---
title: paket: sl — ånglok
status: done
tags: [packages, fun]
updated: 2026-07-18
---

## Mål
`sl` — animerat ASCII-ånglok (det klassiska `ls`-typo-skämtet). Screen-app med
en tick-loop som drar loket över skärmen. Insats: S.

## Levererat
`brew install sl`. Ren `renderFrame(offset, cols, phase)` ritar loket vid en
kolumn-offset (klipps mot fältkanterna); `trainLines(phase)` växlar hjulrad så
drivhjulen "snurrar". Screen-appen drar offset nedåt på en timer och avslutar
själv när tåget klarat vänsterkanten (`^X` bailar tidigt). Som äkta `sl` sväljs
tangenttryck — det är skämtet. Enhetstest (kant-klippning, hjulfas,
auto-avslut).
