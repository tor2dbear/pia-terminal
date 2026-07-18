---
title: Kommando-kedjning — && || ;
status: done
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

## Levererat
Spikade **beslut (b): `ctx.error()` sätter en fail-flagga** — inget kommando behöver
ändras, och det stämmer för nästan alla fall (terminalen dirigerar redan alla fel
genom `error()`).
- **Parsning:** ny `parseSequence` i `parse.ts` ovanpå `parsePipeline` — splittar
  på topp-nivå `;`/`&&`/`||` (citat-medvetet; ett ensamt `|` stannar i sin
  pipeline), och varje segment parsas som förut. Trailing `;` tillåtet; ledande
  operator / tom operand = syntaxfel.
- **Exekvering:** `executePipeline` returnerar nu `boolean` (success = inget fel
  skrevs). `submit` kör sekvensen vänster→höger med kortslutning: `&&` hoppar vid
  föregående *fail*, `||` vid *success*, `;` alltid. Ett hoppat steg lämnar
  status orörd, som ett riktigt skal.
- **Söm:** `context()` tar ett delat `status`-objekt; `error()` sätter
  `failed = true`. `busy`/input-synlighet flyttades upp till `submit` så det inte
  flimrar mellan pipelines. Skärm-appar (`nano foo && echo klart`) väntar korrekt
  via `runApp`.

Täckt av 7 parse-tester (split/connectorer/citat/trailing-`;`/fel) + 5 end-to-end
(`;`, `&&` success/fail, `||` fail/success). 312 tester gröna; typecheck + build
gröna; boot verifierad i headless Chromium.

_`$?`, subshells `( )` och `&` (bakgrund) kvar som möjlig uppföljning — men den
implicita fail-flaggan räcker för kedjning._
