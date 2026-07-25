---
title: "paket: piano — Web Audio-synt"
status: done
tags: [packages, audio, fun]
updated: 2026-07-25
---

## Mål
`piano` — ett spelbart tangentbord; PIA:s första ljud. Insats: M.

## Levererat
`brew install piano`. En oktav mappad mot datortangenterna (`a s d f g h j k` =
vita, `w e t y u` = svarta), eller tryck på tangenterna på skärmen på mobil.
`z`/`x` skiftar oktav. Ren `noteFreq("C4")` (liksvävande temperatur, A4 = 440 Hz);
toner spelas som triangelvågor med en kort pluck-envelope via Web Audio — helt
klientsidan, CSP-säkert. AudioContext skapas vid första tonen (en riktig
användargest, som webbläsare kräver) och saknas i jsdom, så appen degraderar till
tyst-men-visuell under test. Realistisk klaviatur (svarta tangenter placerade via
CSSOM `left`, CSP-säkert). Enhetstest (frekvens-ankare/oktav/halvton, tangenter
ritas, oktav-clamp, avslut, inget kast utan Web Audio).
