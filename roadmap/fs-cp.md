---
title: cp — kopiera filer och mappar
status: next
tags: [fs, commands]
updated: 2026-07-17
---

## Mål
`cp <källa> <mål>` kopierar en fil; `cp -r <mapp> <mål>` kopierar ett träd. Idag
finns `mv` men ingen kopiering — en glaring lucka bland grunderna.

## Research
- **Var det hör hemma:** `src/commands/fs.ts`, bredvid `mv`. Mycket av
  path-logiken (mål är fil vs befintlig mapp) kan speglas från `mv`.
- VFS:en är ett träd i minnet; en kopia måste vara en *djup* klon av noden, inte
  en delad referens — annars muterar man båda. Verifiera att en kopierad mapp
  inte delar barn med originalet.
- Idiom: `cp fil dir/` lägger `fil` *i* mappen; `cp a b` skapar/skriver över `b`.
  `cp -r` krävs för mappar (utan `-r` → fel "omitting directory", som riktiga cp).
- Persistens: efter kopian, `ctx.persist()` som andra muterande fs-kommandon.

## Öppna frågor
- Skriva över befintligt mål tyst (cp-default) eller varna? Följ cp: tyst.
- `cp -r` in i sig själv (mål inuti källa) — upptäck och vägra, annars oändlig
  loop. Testa explicit.
- Interagerar med delade filer (`@`-märkta): ska en kopia ärva delningen eller bli
  en fristående lokal fil? Troligen fristående — flagga i bygget.

_Ligger i `next`. Liten, avgränsad, hög vardagsnytta._
