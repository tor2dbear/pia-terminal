---
title: Kommando-kedjning — && || ;
status: later
tags: [shell, terminal]
updated: 2026-07-17
---

## Mål
Kedja kommandon: `;` (kör i följd), `&&` (kör nästa bara om föregående lyckades),
`||` (kör nästa bara om föregående misslyckades). Förväntas för varje
flerstegsflöde.

## Research
- **Var det saknas:** `parsePipeline` i `src/terminal/parse.ts` känner bara `|`,
  `>`, `>>`. `;`/`&&`/`||` behandlas som vanlig argumenttext.
- **Den verkliga designfrågan — exit-status.** `&&`/`||` kräver att ett kommando
  har *lyckats eller misslyckats*. Idag returnerar `run()` `void`; det finns inget
  status-begrepp. Behöver antingen (a) ett returvärde/`ctx.exit(code)`, eller (b)
  att `ctx.error()` sätter en implicit fail-flagga för staget. Detta är kärnan i
  pucken — spika den innan syntaxen.
- Parsning: en nivå ovanför pipelines — en lista av pipelines separerade av
  `;`/`&&`/`||`, utvärderad vänster→höger med kortslutning.
- Idiom: `;` alltid; `&&`/`||` på status. Precedens som bash (alla tre samma
  nivå, vänsterassociativa räcker för en enkel terminal).

## Öppna frågor
- Hur ska exit-status modelleras utan att röra alla befintliga kommandon? Lutar åt
  en implicit "skrevs ett fel?"-flagga per stage, så inget kommando behöver
  ändras — men vissa kommandon "misslyckas" utan att skriva fel. Väg alternativen.
- Interaktion med redirect (`a && b > fil`) — bind redirect till rätt pipeline.
- Behövs subshells/`( )`? Nej, långt bortom grunderna.

_Ligger i `later` — värdefull men rör terminal-kärnan och kräver ett status-beslut._
