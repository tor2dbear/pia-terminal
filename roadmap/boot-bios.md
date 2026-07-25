---
title: Boot-BIOS — retro-uppstartssekvens
status: done
tags: [aesthetic, ui]
updated: 2026-07-25
---

## Levererat (2026-07-25)
Opt-in `bios`-läge: en längre POST-preamble före prompten (BIOS-rad, minnestest,
"Detecting storage…", adapter-lista, boot device), sedan över i den vanliga
hälsningen. `boot.ts` tar nu ett `BootOptions{bios}`; `main.ts` läser flaggan ur
`~/.pia/config` vid boot. **Egen `bios`-flagga** (inte hopbuntad med `crt`) med
ett `bios [on|off]`-kommando som speglar `crt` men bara persisterar (POST spelar
vid nästa reload, inget live att visa). **Skippbar** — valfri tangenttryckning
nollar kvarvarande pauser så en reload aldrig fastnar bakom den. Av som default
(samma tillgänglighets-resonemang som CRT). Verifierad i webbläsare (skärmdump)
+ tester (rc-parse, `bios`-kommando, boot-preamble på/av med fake-timers).

**Kvar som svansar (medvetet ute ur v1):** ljud (boot-brus/tangentljud bakom
samma toggle, Web Audio/CSP-säkert), och en riktig in-place minnesräknare (kräver
att skriva över senaste raden — terminalen är append-only idag). `retro`-paraply
som slår på både `crt` och `bios` kan läggas till senare; flaggorna är oberoende.

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
