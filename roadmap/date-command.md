---
title: date — visa klocka och datum
status: done
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

## Levererat
`date` i `system.ts`, bredvid `whoami`/`neofetch`. Beslut:
- **Format:** GNU-likt `Fri Jul 18 09:18:03 UTC 2026`. `-u` (alias `--utc`) ger
  UTC; annars lokal tid med en `UTC±h`-etikett (0 → `UTC`).
- **Testbarhet:** valde **formatassertion** (ingen klock-injektion, inget nytt
  seam på `CommandContext`) — testerna matchar mönstret, inte värdet. Enklast,
  och `date` behöver inte determinism i produktion.

Täckt av 2 tester (format-regex + att `-u` säger UTC). 291 tester gröna;
typecheck + build gröna.

_`+FORMAT`-strängar och lokala TZ-förkortningar kvar om behovet dyker upp._
