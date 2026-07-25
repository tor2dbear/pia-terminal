---
title: Boot-BIOS — retro-uppstartssekvens
status: inbox
tags: [aesthetic, ui]
updated: 2026-07-25
---

## Mål
En valbar, längre retro-uppstart à la ett BIOS/POST: minnesräkning, "detecting
drives…", en blinkande markör, sedan över i den vanliga prompten. Rent kosmetiskt
men delbart — komplementet till CRT-filtret (som redan är levererat, se
`crt-retro-mode.md`).

## Research
- Bygger på befintligt: `boot.ts` sekvenserar redan en uppstart (input-gate,
  prompt-avslöjande); BIOS-läget är en längre/retro-variant av den.
- Bör vara en **toggle** (config-dotfilen), inte default — samma tillgänglighets-
  resonemang som CRT.
- Passar ihop med CRT men är oberoende: kan köras med eller utan `.crt`-overlay.

## Öppna frågor
- Egen config-flagga (`bios = on`) eller en del av ett bredare `retro`-läge som
  också slår på `crt`?
- Ljud (boot-brus/tangentljud, README nämner en ljud-toggle) — hör hemma här; hålls
  bakom samma toggle och Web Audio (som `piano`), CSP-säkert.
- Hur mycket text/timing utan att bli irriterande vid varje reload? Snabb som
  default, "full POST" bara första gången eller bakom en flagga.

_Utbruten från `crt-retro-mode.md` när CRT-filtret levererades (#65); den här
retro-uppstarten är den obyggda resten._
