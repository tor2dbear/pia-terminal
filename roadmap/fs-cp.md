---
title: cp — kopiera filer och mappar
status: done
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

## Levererat
Ny VFS-metod `copy(from, to, recursive)` (bredvid `move`) med en privat
`clone`-djupklon, plus `cp`-kommandot i `fs.ts`. Så här landade frågorna:
- **Djup klon:** en kopierad mapp delar inga barn med originalet — muterar man
  kopian rör originalet inte (testat explicit).
- **`dir/`-mål:** `cp fil dir` lägger `fil` *i* mappen (speglar `move`s
  into-dir-semantik). `cp a b` skriver/överskriver `b` tyst (cp-default).
- **`-r` krävs för mappar:** utan → fel `omitting directory (use -r)`.
- **Self-copy-skydd:** `cp -r d d/inner` (mål inuti källan) vägras — inget
  oändligt träd.
- **Delning strippas:** en kopia blir en fristående *lokal* fil, ärver inte
  källans `shareId` (beslut från öppna frågan).
- **Flera källor:** `cp a b c dir/` kopierar alla in i `dir` (kräver att målet är
  en mapp) — vilket ger `cp *.md notes/` gratis nu när globbing finns.

Täckt av 6 VFS-tester (`vfs.test.ts`) + 6 kommandotester (`commands.test.ts`):
fil-kopia + oberoende, into-dir, `-r`-krav + djupklon, self-copy-vägran,
share-strip, flera-källor + icke-mapp-fel. 266 tester gröna; typecheck + build
gröna. (Autosuggestion-testet uppdaterat: `cp` är en ny `c`-completion.)

_Övrig cp-yta (`-i` interaktiv, `-p` bevara, `-n` no-clobber) är kvar om behovet
dyker upp._
