---
title: at / crontab — schemalagt (fd "remind")
status: inbox
tags: [commands, scheduling]
updated: 2026-07-17
---

## Mål
(Research/idiom-beslut.) README:s Nivå 3 hade `remind`/schemalagt. Innan bygge:
riktiga terminalnamnet är **`at`** (engångs) och **`crontab`** (återkommande),
inte `remind`. Fråga: gör vi det idiom-troget — och vad *gör* egentligen ett
schemalagt jobb i en webbterminal?

## Research
- **Idiom-drift att räta ut:** `remind` är en web-mynt. `at 9am`, `crontab -e` är
  de äkta namnen och passar "terminal-idiom först". `remind` kan leva kvar som
  alias.
- Kärnfrågan är *vad* som körs och *när*: en webbflik lever inte dygnet runt. Ett
  schemalagt jobb behöver antingen (a) bara fire medan fliken är öppen (svagt),
  eller (b) en serverdel (Supabase cron / Edge Function) som gör något — mejl?
  notis? Det drar mot backend och mot commodity-nytta.
- Vinkeln avgör värdet: som *terminal-lärande* (lär dig `at`/`cron`-syntax i en
  sandlåda) är det on-brand; som *påminnelsetjänst* är det commodity som
  konkurrerar med allt.

## Öppna frågor
- Vad triggar jobbet i praktiken — bara in-flik, eller en serverdel? Utan svar är
  featuren luftig.
- Om den byggs: är poängen att *lära ut cron-syntax* (då räcker in-flik +
  loggning) eller att *faktiskt påminna* (då krävs backend)? Bestäm vinkel först.

_Ligger i `inbox` tills vinkeln är spikad._
