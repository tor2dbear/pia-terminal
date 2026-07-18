---
title: history — lista och återanvänd tidigare kommandon
status: inbox
tags: [shell, terminal]
updated: 2026-07-17
---

## Mål
Ett `history`-kommando som listar tidigare rader, och ev. history-expansion
(`!!` = förra, `!$` = sista argumentet, `!n` = rad n). History *finns* internt
men går inte att lista eller återanvända från kommandoraden.

## Research
- **Var det bor:** history lever i terminal-kärnan (`src/terminal/terminal.ts`,
  pil-upp/ner). Ett `history`-kommando måste *nå* den listan — men kommandon når
  världen bara via `CommandContext`. Kräver alltså en ny hook (t.ex.
  `ctx.history()`), i samma anda som `applyConfig`/`reloadFs`.
- **`!!`/`!$`/`!n`** är däremot inte ett kommando utan en *expansions-pass* i
  kärnan, före parsning — mer som globbing. Kan byggas separat från
  `history`-listningen; listningen är den enkla halvan.
- Persistens: history är idag bara in-session (försvinner vid reload). En äkta
  `history` vill kanske spara till `~/.pia/`-dotfilen. Separat beslut.
- Idiom: `history` listar numrerat; `history -c` rensar.

## Öppna frågor
- Bara listning först (enkelt, en `ctx.history()`-hook), och skjut `!!`-expansion
  till en egen omgång? Troligen ja — dela pucken om `!`-expansion växer.
- Persistera history mellan sessioner (mot dotfilen), eller hålla in-session? Väg
  mot cloud-sync-frågorna.

_Ligger i `inbox`. Listnings-delen är liten; `!`-expansion är en egen sak._
