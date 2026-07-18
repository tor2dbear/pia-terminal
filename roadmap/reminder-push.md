---
title: Påminnelser som webapp — push till iOS/Android
status: inbox
tags: [scheduling, pwa, push]
updated: 2026-07-18
---

## Mål
Den "riktiga" versionen av `at`/`crontab`: påminnelser som fyrar **även när fliken
är stängd**, som en notis på iOS/Android. Bygger vidare på lärverktyget (samma
`at`/cron-syntax) men lägger till äkta leverans.

## Vad som krävs (research)
- **PWA + service worker:** appen installeras på hemskärmen; en service worker tar
  emot push även när fliken är stängd. iOS stödjer web push sedan **16.4**, men
  bara för PWA installerade via "Lägg till på hemskärmen".
- **Web Push + VAPID:** prenumeration i browsern → en push-endpoint per enhet.
- **Backend som fyrar:** en serverdel (Supabase edge function + `pg_cron` /
  scheduled trigger) som håller schemat och skickar web-push när jobb är due.
  Jobben måste bo i molnet (inte localStorage), så det kräver inloggning.
- Manifest + service worker är samma-origin → ok under CSP.

## Öppna frågor
- Bara för inloggade (jobben i molnet)? Rimligen ja.
- Notis-innehåll: bara "påminnelse: <text>", eller köra ett kommando? För push
  räcker text; att köra kommandon serversidan är en helt annan sak.
- Hur mycket äga vs använda tjänst? Web Push är gratis/standard; det är schemaläggar-
  backenden som är jobbet.

_Ligger i `inbox` tills lärverktyget finns och lusten att göra det "på riktigt"._
