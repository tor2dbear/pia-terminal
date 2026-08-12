---
title: sh — kör scriptfiler
status: done
tags: [shell, terminal]
updated: 2026-08-12
---

## Mål
`sh script.sh` läser en fil ur VFS:en och kör den rad för rad genom det
befintliga skal-maskineriet — pipes, `;`/`&&`/`||`, redirects och globbing. Gör
PIA till "en riktig liten dator" på skal-nivå: man kan spara en följd av
kommandon i en fil och köra den. Efterfrågat av tidiga testare (script-filer var
den enskilt största saknade skal-biten efter kedjning och globbing).

## Research
- **Alla byggstenar fanns redan.** `command-chaining` och `shell-globbing` är
  klara, och `CommandContext` exponerar redan `exec?(line): Promise<boolean>` —
  sömmen `sudo` använder för att köra sin payload genom `runLine → runSequence →
  executePipeline`. `sh` är i princip "läs fil → `ctx.exec` per rad", precis som
  `sudo` är "kör payload elevated". Ingen ny kärn-söm behövdes.
- **Idiom:** `sh script.sh` och `sh -c "cmd"` är rakt av äkta. Ingen divergens.
- **Ingen exec-bit i VFS.** `FileNode` har bara `name`/`content` (+ `shareId`),
  ingen `mode`. Så `chmod +x ./script` + shebang-körning (`./script`) kräver att
  filmodellen och serialiseringen växer ett läges-fält — medvetet **utanför v1**.
  En shebang-**rad** (`#!/bin/sh`) hanteras ändå gratis: den börjar med `#` och
  behandlas som en kommentar.

## Levererat (2026-08-12)
`sh` som ett vanligt `Command` i `src/commands/system.ts`, bredvid `sudo`:
- **`sh <fil>`** — resolvar mot cwd, läser ur VFS:en, kör varje rad via
  `ctx.exec`. Tomma rader och kommentarer (`#…`, inklusive en `#!`-shebang på
  rad 1) hoppas över.
- **`sh -c "<kommando>"`** — kör en kommandosträng direkt.
- **`cmd | sh` / `cat script | sh`** — utan filargument körs *stdin* som script,
  så en pipe eller heredoc-lik ström funkar.
- **Fortsätter vid fel** (inget `set -e`): en rad som failar stoppar inte
  scriptet. Skalets slut-status = sista körda kommandots, propagerad via
  `ctx.fail?.()` (ingen dubbel-utskrift — payload-fel skrivs redan av
  maskineriet) så `sh a.sh && echo ok` beter sig rätt.
- **Ctrl-C** avbryter mellan rader (kollar `ctx.signal`), som resten av skalet.

## Öppna frågor / uppföljning
- **`chmod +x` + shebang-körning (`./script`)** — kräver ett läges-/exec-fält på
  `FileNode` + serialisering. Egen puck när behovet finns.
- **Positionsargument (`$1`, `$@`) och `$?`** — väntar på variabel-expansion
  (samma uppföljning som `command-chaining` noterade). `sh script.sh a b` tar
  emot extra args men ignorerar dem tills expansion finns.
- **Pipa `sh`:s aggregerade stdout** (`sh f.sh | grep x`) — inre rad-utskrift går
  till skärmen, inte in i pipen (samma klass av begränsning som `sudo`). Att
  fånga payload-stdout kräver att `exec`-sömmen returnerar utdata. Uppföljning.
- **`source` / `.`** (kör i nuvarande skal istället för sub-skal) — meningsfullt
  först när det finns skal-lokalt tillstånd (variabler) att dela.
