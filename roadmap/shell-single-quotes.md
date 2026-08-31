---
title: "shell: enkla citattecken (`'…'`) tokeniseras inte"
status: done
tags: [terminal, shell]
updated: 2026-08-31
---

## Mål
`tokenize()` förstod bara **dubbla** citattecken. Enkla citat följde med in i
argumentet som vanliga tecken — så `echo 'hello world'` skrev `'hello world'`
med citattecknen kvar, och `python -c 'print(6*7)'` skickade strängen
`'print(6*7)'` till Python, som då evaluerade ett *stränglitteral* och skrev
`print(6*7)` istället för `42`. Tyst fel: inget felmeddelande, bara fel svar.

Upptäckt 2026-08-31 vid verifiering av `python-sandbox-csp-fix` i en riktig
browser.

## Levererat
`tokenize()`, `lex()` och `splitSequence()` delar nu en `quoteStep()` — ett
citat-tillstånd (`null` / `"` / `'`) istället för en boolean — så alla tre
lexerna är eniga om var ett citat börjar och slutar. Bägge citatslagen fungerar,
och vart och ett är literalt inuti det andra (`"don't"`, `'say "hi"'`), precis som
i ett riktigt skal. Glob-skyddet (`shield()`) gäller nu bägge, så `'*.md'` är
literalt likt `"*.md"`.

`python -c 'print(6*7)'` ger **42** i browsern (var `print(6*7)`), och
`echo 'hello world'` skriver `hello world` utan citattecken.

Tester: 8 nya parse-tester + 4 end-to-end i jsdom-terminalen (citat, apostrof,
citerat filnamn, glob-skydd), och två tour-rader (`echo 'both quote kinds work'`,
`echo don't`) så regressionen syns i guldfilen.

## Varför det spelade roll
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

## Öppna frågor (avgjorda)
- **Oparad `'`:** → **literal apostrof**. Ett riktigt skal öppnar en
  fortsättningsprompt för att avsluta citatet; PIA har ingen sådan, och att tyst
  svälja apostrofen (det en oparad `"` gör) läser som en bugg i vanlig text.
  Regeln: `'` är avgränsare bara när raden har en till som stänger den. Divergensen
  är medveten och dokumenterad i koden.
- **Backslash-escape (`\'`, `\"`):** ❌ inte nu. PIA expanderar inga variabler, så
  citatslagen skiljer sig inte åt i övrigt — escapes vore lager utan vinst. Egen
  puck den dag expansion finns.
- **Tour-rad:** ✅ tillagd (se ovan).

### Kvar (medvetet)
En oparad `"` sväljs fortfarande tyst (`echo "hi` → `hi`), oförändrat sedan
tidigare. Asymmetrin är avsiktlig: lookahead-regeln finns för att skydda
apostrofer i prosa, och ingen skriver ett ensamt `"` av misstag.
