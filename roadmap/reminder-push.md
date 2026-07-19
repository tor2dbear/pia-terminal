---
title: Påminnelser som webapp — push till iOS/Android
status: now
tags: [scheduling, pwa, push]
updated: 2026-07-18
---

## Mål
Den "riktiga" versionen av `at`/`crontab`: påminnelser som fyrar **även när fliken
är stängd**, som en notis på iOS/Android. Bygger vidare på lärverktyget (samma
`at`/cron-syntax) men lägger till äkta leverans.

## Levererat (2026-07-18)
`remind <tid> <text>` (inloggad) schemalägger en push-notis som fyrar serversidan.

**Server (live på Supabase, verifierat):**
- Tabeller `push_subscriptions` + `reminders`, RLS på `auth.uid()`.
- VAPID-nycklar + cron-secret i **Vault**; läses via en service-role-funktion
  `get_push_config()`.
- Edge Function **`send-due`** (auth via `x-cron-secret`, `verify_jwt` av): läser
  due reminders, gör web-push-kryptot (`web-push` i Deno, skickar via fetch),
  städar utgångna prenumerationer, avaktiverar engångsjobb.
- **`pg_cron`** varje minut → `pg_net` POST → funktionen. Verifierat end-to-end:
  cron→200 `{ok,due:0}`, och en testkörning gav `sent:1` (kryptot funkar i Deno).

**Klient:**
- **PWA:** `manifest.webmanifest` + service worker (`public/sw.js`) — visar notis
  på `push`, fokuserar appen på klick. SW registreras vid boot. CSP fick
  `worker-src`/`manifest-src 'self'`.
- **Seam:** `ReminderStore` (Null/Memory/Supabase) speglar `ShareStore`.
  `remind` pratar bara med interfacet. Prenumeration via `pushManager.subscribe`
  med VAPID-publika nyckeln, sparas i `push_subscriptions`.
- **`remind`**: `<tid> <text>` (auto-aktiverar push), `-l` lista, `-r <n>` avboka,
  `on` aktivera. iOS-guidning ("lägg till på hemskärmen först").

## Kvar
- **On-device-test:** att notisen faktiskt landar på en iPhone-låsskärm — kräver
  PWA:n installerad + en riktig prenumeration. Allt fram till push-endpointen är
  bevisat; själva leveransen är ett du-på-telefonen-steg.
- Återkommande reminders (cron-uttryck) — kolumnen finns, logiken är one-off nu.

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
