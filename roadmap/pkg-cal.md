---
title: paket: cal — månadskalender
status: done
tags: [packages]
updated: 2026-07-18
---

## Mål
`cal [månad år]` ritar en månadskalender (äkta Unix). Default: nuvarande månad.
Ren, testbar (ge månad/år för determinism). Insats: S. **Första omgången.**

## Levererat
`brew install cal`. Ren `renderCal(month, year)` → rader, egen lazy-chunk.
`cal`, `cal 7`, `cal 7 2026`. Enhetstest (rubrik, veckodagsjustering, skottår)
+ med i touren. Ingen dag-highlight: `print` är ren text (ingen ANSI), och äkta
`cal` tappar highlight i pipe/icke-TTY ändå — plain kalender är idiom-rätt.
