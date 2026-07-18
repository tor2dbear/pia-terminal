---
title: "grep: context-flaggor -A/-B/-C"
status: done
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

## Levererat
Byggt i `src/commands/text.ts` med en dedikerad `parseGrepArgs` (befintliga `-i`
`-n` `-v` rör vi inte). Så här landade frågorna:
- **Attach + separat form:** både `-A2` och `-A 2` funkar, och de kan blandas i
  kluster (`-inA2`).
- **`-C` vs explicit:** `-C` sätter båda hållen; explicit `-A`/`-B` vinner
  oavsett ordning.
- **`-A0`/`-B0`:** tillåtet, beter sig som utan context (GNU-troget).
- **Overlap:** context-fönster som överlappar *eller angränsar* slås ihop —
  delade rader skrivs en gång.
- **`--`-separator:** **inkluderad** (avvek från research-notens "hoppa först") —
  den föll ut gratis ur grupp-logiken och är det äkta grep-beteendet, vilket är
  hela poängen med pucken. Skrivs bara mellan icke-angränsande grupper när
  context är på; vanlig `grep` utan context är byte-identisk med förr.
- **`-n` med context:** träffrad använder `:`, context-rad `-`, som riktiga grep.
- **Ogiltigt antal** (`-A x`) ger ett rent fel istället för tyst fallback.
- **Pipes:** ärvs av att kommandot läser `ctx.stdin` som förut.

Täckt av 11 nya tester i `commands.test.ts` (223 totalt gröna); `typecheck` +
`build` gröna.
