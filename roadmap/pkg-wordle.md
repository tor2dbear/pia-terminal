---
title: "paket: wordle — gissa fembokstavsordet"
status: done
tags: [packages, games]
updated: 2026-07-25
---

## Mål
`wordle` — gissa det dolda fembokstavsordet på sex försök, med färgad feedback
(rätt / finns / saknas). Screen-app. Insats: S–M.

## Levererat
`brew install wordle`. Ren `scoreGuess(guess, answer)` med Wordles två-pass-logik
för dubbletter (exakta först, sedan "finns" bara medan oanvända kopior återstår).
En kurerad ordlista (~250 vanliga ord) är både svars-pool och tillåtna gissningar
— ingen ordboks-fetch, CSP-säkert. Svaret dras med injicerbar rng (deterministiskt
i test). 6×5-rutnät, statusrad och en QWERTY-tangenthint som färgas per bokstav.
Bokstäverna kommer från enhetens tangentbord (`onText`); ⏎ skickar, ⌫ raderar, och
eftersom `q` är en bokstav avslutar man med Esc/^X eller tangentbarens knapp.
"present"-gult saknas i paletten → en varm amber som läser rätt mot alla teman.
Enhetstest (poängsättning inkl. dubbletter, giltig gissning vinner, icke-ord
avvisas, ordlistans format).
