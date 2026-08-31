---
title: "shell: enkla citattecken (`'…'`) tokeniseras inte"
status: inbox
tags: [terminal, shell]
updated: 2026-08-31
---

## Mål
`tokenize()` förstår bara **dubbla** citattecken. Enkla citat följer med in i
argumentet som vanliga tecken — så `echo 'hello world'` skriver `'hello world'`
med citattecknen kvar, och `python -c 'print(6*7)'` skickar strängen
`'print(6*7)'` till Python, som då evaluerar ett *stränglitteral* och skriver
`print(6*7)` istället för `42`. Tyst fel: inget felmeddelande, bara fel svar.

Upptäckt 2026-08-31 vid verifiering av `python-sandbox-csp-fix` i en riktig
browser.

## Varför det spelar roll
- **Idiom-brott.** I varje riktigt skal är `'…'` det *starkare* citatet (ingen
  expansion alls). Att bara stödja `"…"` är precis den sortens divergens
  CLAUDE.md säger att vi ska undvika — och den är inte ens ett medvetet val,
  bara en lucka.
- **Vi lär ut fel.** `python`s egen `help`/`usage` säger
  `python -c 'code'` (`src/packages/python/index.ts:38,40`), och `man`/`tutor`
  använder samma vana. Följer man instruktionen får man fel resultat.
- Samma fälla drabbar allt som tar kod eller text som ett argument:
  `sh -c '…'`, `grep '…'`, `echo`.

## Research
- Allt sitter i `tokenize()` i `src/terminal/parse.ts` (~rad 15–39): ett enda
  `inQuotes`-flagga-fall för `"`. Samma mönster finns i `parsePipeline` (rad 78)
  och på rad 180 — alla tre behöver kunna hoppa över ett citerat parti.
- Glob-skyddet finns redan: `shield()` byter `*`/`?` mot sentinels inuti citat
  (`WILD_STAR`/`WILD_QUES`), så `'*.md'` ska bete sig som `"*.md"` gör idag.
- Skillnaden mellan `'` och `"` i ett riktigt skal (ingen variabelexpansion i
  enkla) spelar ingen roll här ännu — PIA expanderar inga variabler. Så v1 kan
  behandla dem *likadant*: två citattecken istället för ett.
- Fällan att undvika: apostrofer i vanlig text. `echo it's fine` får inte bli ett
  hängande citat. Riktiga skal gör det (öppen quote → fortsättningsrad), men PIA
  har ingen `>`-fortsättningsprompt — enklaste ärliga regeln är att en *oparad*
  `'` behandlas som ett vanligt tecken.

## Öppna frågor
- Oparad `'` → literal (ovan), eller fel (`unexpected EOF while looking for
  matching quote`)? Literal är snällare mot `don't`; fel är mer skal-likt.
- `\'`-escape inuti dubbla citat och tvärtom — värt det, eller överkurs för v1?
- Ska touren få en rad som visar bägge citatslagen, så regressionen fångas?
