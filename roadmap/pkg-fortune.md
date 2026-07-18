---
title: paket: fortune — slumpcitat
status: done
tags: [packages]
updated: 2026-07-18
---

## Mål
`fortune` — skriver ett slumpat citat ur en inbyggd lista. Injicerbar rng för
test. Klassiskt Unix-godis. Insats: S. **Första omgången.**

## Levererat
`brew install fortune`. Inbyggd citatlista (dator-/Unix-tema, on-brand). Ren
`pickFortune(rng)` med injicerbar rng → enhetstestbar. Kommandot seedar från
klockan (`Date.now()`), så det varierar mellan riktiga anrop men blir
deterministiskt under tourens frusna klocka (ingen redaktion behövs). Med i
touren.
