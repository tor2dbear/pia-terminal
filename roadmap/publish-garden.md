---
title: publish → digital garden (index, styling, RSS)
status: inbox
tags: [share, web]
updated: 2026-08-08
---

## Mål
(Research, inte beslutat.) Lyfta `publish` (levererad, se `publish-folder`) från
"en mapp landar i mottagarens `~/incoming/`" till en riktig **läs-vy för
omvärlden**: en publik, stylad sida med en **index/omslag**, läsbar typografi,
och ett **flöde** (RSS/Atom) — så terminalen blir en enkel CMS för det du redan
skriver i `nano`. On-brand: du äger redan domänen och skrivytan; det här är att
*visa upp* filerna, inte en ny app.

## Research
- **Var vi står:** `publish <mapp>` packar `.md`-filerna self-contained i en
  `#p=`-hash och materialiserar dem i mottagarens *egen session* (`~/incoming/`),
  läst med `glow`/`cat`. Ingen server, funkar för guests. Det är en **dela-med-
  en-person**-vy, inte en **publicera-för-världen**-vy — den här pucken är det
  senare, ett steg *bredvid* det som redan finns, inte en ändring av det.
- **Spänningen som måste spikas först — hash vs URL.** Dagens `#p=` är genialt
  serverlöst men (a) taket är `MAX_PUBLISH_PAYLOAD` = 32 KB, (b) länken är ful och
  odelningsbar i praktiken, (c) den renderas i *mottagarens* terminal, inte som en
  sida en främling kan läsa utan att förstå PIA. En "garden" vill ha en **stabil,
  ren URL** (`/g/<slug>`) och en **HTML-sida** som står på egna ben. Det bryter
  mot serverlös-principen — kräver antingen Cloudflare Pages Functions / en Worker
  + lagring (Supabase-rad per publicerad garden), eller ett statiskt build-steg.
  **Detta är kärnvalet i pucken — spika det innan något byggs.**
- **Idiom-flagga (terminal-first):** `publish` är redan en accepterad web-
  divergens (returnerar URL). En garden utökar den divergensen (index, RSS) — inte
  ett nytt Unix-verb utan mer webb bakom samma verb. Kalla det vad det är.
- **Renderaren finns till hälften:** `glow`/`cat` läser redan markdown i
  terminalen; en publik HTML-vy behöver en egen (minimal) md→HTML + tema. Håll den
  liten och CSP-säker (samma disciplin som resten av `dist/`).

## User stories
- **US 1 — blogga från terminalen.**
  *Som* person som vill skriva publikt *vill jag* skriva markdown i `nano` och
  publicera en mapp med ett kommando *så att* terminalen är min CMS.
  `nano garden/2026-solresor.md` → `publish garden/` → `https://…/g/<slug>` med en
  index-sida som listar inläggen (nyast först) och en läsvy per inlägg.
- **US 2 — dela en enskild fil som en ren länk.**
  *Som* någon som snabbt vill dela en anteckning *vill jag* `publish note.md` *så
  att* jag får en kort, ren URL att klistra in i ett samtal — läsbar av vem som
  helst utan att de behöver förstå PIA. (Snabbaste vägen till att *andra* rör vid
  PIA, och en krok tillbaka till kontoskapande.)
- **US 3 — ett flöde att prenumerera på.**
  *Som* återkommande läsare *vill jag* att en publicerad garden exponerar
  `/g/<slug>/feed.xml` *så att* jag kan följa den i en RSS-läsare.

## Öppna frågor
- **Hash vs server-URL** (se research) — det blockerande valet. Går det att göra
  "ren URL + HTML-sida" *utan* att ge upp serverlöst helt (t.ex. en tunn Pages
  Function som bara packar upp `#p=`-payloaden till en läsbar sida på en snygg
  route)? Eller kräver index/RSS oundvikligen lagring?
- Guest vs inloggad: kan en guest publicera en beständig garden, eller kräver
  stabil URL inloggning (som `ai-mcp-context` landade i för sin write-yta)?
- Storlek: 32 KB-taket räcker inte för en växande garden — vad ersätter det om vi
  går server-vägen?
- Överlappar `linked`/`publish`/`share` — rita om ansvarsgränsen innan bygge så vi
  inte får tre nästan-lika verb.

_Ligger i `inbox` tills hash-vs-URL-valet är fattat. Befordra till `next/later` då._
