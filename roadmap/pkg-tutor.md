---
title: paket: tutor — interaktiv terminal-kurs
status: done
tags: [packages, learning]
updated: 2026-07-18
---

## Mål
Ett `tutor`-paket: en **guidad, interaktiv kurs** i terminalen som lär ut
kommandon steg för steg och kollar vad du skriver. PIA:s själ i paketform — ingen
annan webbterminal har en inbyggd kurs.

## Skiss
Screen-app eller kommando som visar lektioner ("skapa en fil med touch", "lista
med ls") och validerar. Lektionsdata som ren data. Insats: M.

## Levererat
`brew install tutor`. Screen-app med egen mini-prompt: visar en instruktion, du
skriver ett kommando, den kollar *formen* mot lektionen och går vidare — lär ut
riktig shell-syntax (kommandonamn, flaggor, `>`, `|`) som funkar i valfritt
skal. 8 lektioner (`pwd` → `ls` → `mkdir` → `cd` → redirect → `cat` → pipe →
`help`), var och en med förklaring vid rätt svar och lösningsförslag vid fel.

**Arkitektur:** lektionerna är ren data (`LESSONS`) med en pure `accepts(input)`
+ `normalize`; progressionen är en DOM-lös `TutorSession` (`submit`/`current`/
`isComplete`). Allt enhetstestat; screen-appen är bara skärm + radeditor.

**Not (medvetet val):** kursen validerar *syntax*, den kör inte kommandona mot en
riktig sandbox-VFS. Det är en solid MVP och on-brand; en framtida version skulle
kunna köra svaren mot en scratch-VFS för att också visa resultatet.
