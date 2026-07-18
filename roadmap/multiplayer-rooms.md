---
title: Multiplayer — who, msg, gemensamma rum
status: later
tags: [multiplayer, supabase]
updated: 2026-07-17
---

## Mål
Flera inloggade i samma värld samtidigt: `who` (vilka är online), `msg <user>`
(skicka meddelande), och gemensamma rum — en BBS-vibe.

## Research
- Realtime-sömmen finns redan: shared lists live-syncar via Supabase Realtime.
  Presence (`who`) och meddelanden rider på samma infra — troligen en ny
  `ShareStore`-liknande söm eller en presence-kanal.
- On-brand nostalgi: BBS/`talk`/`wall` är äkta Unix- och tidig-nät-idiom. `who`,
  `msg` (jfr `write`/`talk`), rum (jfr IRC/`wall`) är riktiga namn — passar
  "terminal-idiom först".
- Komplexitet högre än en enskild app: presence-state, moderering, spam,
  identitet. Börja smått (`who` + `msg`) innan rum.

## Öppna frågor
- Idiom: `msg` vs riktiga `write`/`talk`? Rum vs `wall`/IRC-stuk? Spika namnen
  mot Unix innan bygge.
- Presence-modell: räcker Supabase Realtime presence, eller behövs en tabell?
- Värt komplexiteten jämfört med fler screen-appar? Håll i `later` tills en
  verklig lust finns — det är ett stort åtagande för en enmansterminal.

_Ligger i `later`. Befordra när lusten och en avgränsad start finns._
