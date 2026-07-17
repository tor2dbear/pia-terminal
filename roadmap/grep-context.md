---
title: "grep: context-flaggor -A/-B/-C"
status: now
tags: [text, commands]
updated: 2026-07-17
order: 10
---

## Mål
`grep` stödjer redan `-n`. Lägg till `-A<n>`/`-B<n>`/`-C<n>` (efter/före/runt)
så att en träff kan visas med omgivande rader — precis som riktiga grep. Håller
oss trogna idiomet "riktiga flaggnamn, riktigt beteende".

## Research
- GNU grep-semantik: `-C` är kortform för lika mycket `-A` som `-B`. Explicit
  `-A`/`-B` vinner över `-C` om båda anges.
- Separator `--` mellan icke-angränsande träffgrupper i GNU grep. Värt att
  härma för att kännas äkta; hoppa först, lägg till om det känns tomt utan.
- Piping: måste funka i pipes (`cat fil | grep -C2 foo`) via `ctx.piped`, inte
  bara mot filargument.

## Öppna frågor
- Ska `-A0`/`-B0` bete sig som utan flagga, eller vara fel? GNU tillåter 0 —
  följ det.
- Overlap: när två träffars context-fönster överlappar ska de slås ihop, inte
  dubbeltryckas. Testa det explicit.
