---
title: CRT/retro-mode + boot-BIOS
status: later
tags: [aesthetic, ui]
updated: 2026-07-17
---

## Mål
Ett valbart retro-läge: CRT-filter (scanlines, glöd, lätt kurvatur) och en
boot-BIOS-sekvens. Ren estetik — men just det slaget som blir screenshottat och
delat.

## Research
- **Underskattat portfolio-värde:** visuellt = delbart = det som gör en
  portfolio-pjäs minnesvärd. "Bara estetik", men det är ofta det folk sprider.
- Bygger på befintligt: temasystemet (`theme`, CSS-custom-properties via CSSOM,
  CSP-säkert — inga inline-styles) finns redan. CRT blir ett tema + ett
  overlay-lager, inte ny arkitektur.
- Boot-sekvens finns (`boot.ts`); BIOS-läget är en längre/retro-variant av den.
- Tillgänglighet: scanline-overlay och glöd kan vara jobbigt för vissa; gör det
  till en toggle (i config-dotfilen), inte default.

## Öppna frågor
- Ren CSS (box-shadow/gradients/filter) eller canvas/WebGL-shader för kurvatur?
  Börja med CSS — billigare, CSP-snällare.
- `theme`-värde eller separat `crt on/off`-toggle ovanpå valfritt tema? Lutar åt
  det senare.
- Ljud (boot-brus/tangentljud, README nämner ljud-toggle) — samma puck eller
  egen?

_Ligger i `later`. Lätt att befordra — bygger mest på det som redan finns._
