---
title: head / tail — se början respektive slutet av en fil
status: next
tags: [text, commands]
updated: 2026-07-17
---

## Mål
`head [-n <k>] [fil...]` och `tail [-n <k>] [fil...]` visar de första/sista `k`
raderna (default 10). Idag finns bara `cat` (allt) — ingen väg att titta på en
del.

## Research
- **Var det hör hemma:** `src/commands/text.ts`, samma mönster som `grep`/`wc` —
  återanvänd `sourcesOf(ctx, files)` som redan läser filargument *eller* piped
  stdin, så de komponerar: `cat stor.log | tail -n5`.
- Flera filer → prefixa med `==> namn <==`-rubrik mellan filer, som riktiga
  head/tail. Med en enda källa: ingen rubrik.
- `-n <k>` i både `-n5` och `-n 5`-form (samma parser-behov som `grep`s context —
  kan spegla `parseGrepArgs`-mönstret).

## Öppna frågor
- `tail -f` (follow) — meningslöst i en statisk VFS utan strömmande filer. Hoppa;
  ev. senare mot en live-loggkälla.
- `head -c <bytes>` (tecken istället för rader)? Lägg till om det känns tomt utan;
  börja med `-n`.
- Negativt/`+`-prefix (`tail -n +2` = från rad 2)? Idiom-troget men nisch — hoppa
  först.

_Ligger i `next`. Grupperad puck: head och tail är spegelbilder, bygg ihop._
