---
title: CRT/retro-mode
status: done
tags: [aesthetic, ui]
updated: 2026-07-25
---

## Mål
Ett valbart retro-läge: CRT-filter (scanlines, glöd, lätt kurvatur). Ren estetik
— men just det slaget som blir screenshottat och delat.

## Levererat (2026-07-25)
`crt on/off/toggle` (`src/commands/config.ts`) togglar ett `.crt`-overlay-lager i
`src/style.css`: fosfor-glöd (text-shadow + halation), aperture-grille-RGB-mask
(`::before`), scanlines + vinjett (`::after`), och en accent-glöd på knappraden
(`.crt .kb-key`). Ren CSS (ingen shader), CSP-säkert via CSSOM. Sparas i
`~/.pia/config` och kan slås av — inte default (tillgänglighet). Öppna frågan
"tema-värde vs separat toggle" landade i det senare (`crt`, ovanpå valfritt tema).

Kvar av den ursprungliga idén: **boot-BIOS-sekvensen** — utbruten till en egen
puck (`boot-bios.md`), eftersom CRT-filtret i sig är levererat.

## Research
- **Underskattat portfolio-värde:** visuellt = delbart = det som gör en
  portfolio-pjäs minnesvärd. "Bara estetik", men det är ofta det folk sprider.
- Bygger på befintligt: temasystemet (`theme`, CSS-custom-properties via CSSOM,
  CSP-säkert — inga inline-styles) finns redan. CRT blir ett tema + ett
  overlay-lager, inte ny arkitektur.
- Tillgänglighet: scanline-overlay och glöd kan vara jobbigt för vissa; gjordes
  till en toggle (i config-dotfilen), inte default. ✅

## Öppna frågor (avgjorda)
- Ren CSS vs canvas/WebGL-shader → **ren CSS** (billigare, CSP-snällare). ✅
- `theme`-värde vs separat toggle → **separat `crt on/off`** ovanpå valfritt tema. ✅
- Ljud (boot-brus/tangentljud) → flyttat till `boot-bios.md` (hör ihop med den
  retro-uppstarten, inte CRT-filtret).

_Levererat i #65. Boot-BIOS-varianten lever vidare i `boot-bios.md`._
