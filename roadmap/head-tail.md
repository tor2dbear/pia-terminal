---
title: head / tail — se början respektive slutet av en fil
status: done
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

## Levererat
`head` och `tail` i `text.ts`, byggda ihop kring en delad `headTail`-hjälpare +
`parseCount`. Så här landade det:
- **Källor:** återanvänder `sourcesOf` — läser filargument *eller* piped stdin, så
  `cat stor.log | tail -n5` komponerar.
- **Antal:** `-n <k>`, `-n<k>` *och* `-<k>` (GNU-shorthand), default 10. Ogiltigt
  antal ger ett rent fel.
- **Radräkning:** en delad `toLines` släpper den tomma rad ett avslutande
  radbryt lämnar, så `tail -n2` på `"a\nb\nc\n"` ger `b,c` (inte en blankrad).
- **Flera filer:** `==> namn <==`-rubriker med blankrad emellan, som riktiga
  head/tail; en enda källa → ingen rubrik.

Täckt av 7 kommandotester (default 10, `-n<k>`, `-<k>`, tail + trailing newline,
namngiven fil, multi-fil-rubriker, ogiltigt antal). 277 tester gröna; typecheck +
build gröna.

_`tail -f`, `head -c` och `+N`-offset är kvar som möjlig uppföljning._
