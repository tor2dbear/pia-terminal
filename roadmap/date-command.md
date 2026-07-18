---
title: date — visa klocka och datum
status: inbox
tags: [system, commands]
updated: 2026-07-17
---

## Mål
`date` skriver nuvarande datum/tid. Förvånande att sakna för nåt som visar ett
"system" (jfr `neofetch`, `whoami`).

## Research
- **Var det hör hemma:** `src/commands/system.ts`, bredvid `whoami`/`neofetch`.
- Trivialt i sak, men **testbarhet:** kommandot får inte läsa `Date.now()` rakt av
  om vi vill ha deterministiska tester (jfr hur rng injiceras i `snake`). Överväg
  en injicerbar klocka via `CommandContext` eller en liten wrapper, så testet kan
  frysa tiden.
- Idiom: default är systemets lokala tid i ett standardformat. `date -u` för UTC.
  Formatsträngar (`date +%Y-%m-%d`) är idiom-troget men kan komma senare.

## Öppna frågor
- Injicerad klocka eller acceptera icke-deterministiskt test (assert:a bara
  formatet, inte värdet)? Lutar åt formatassertion — enklast, inget nytt seam.
- Hur mycket format-flaggor (`+FORMAT`) från start? Troligen ingen — bara
  default + `-u`.

_Ligger i `inbox` — litet, men klock-injektionsfrågan är värd ett beslut först._
