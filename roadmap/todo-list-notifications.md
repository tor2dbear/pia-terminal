---
title: '"Lista uppdaterad"-notiser (coalescade)'
status: done
tags: [collaboration, push]
updated: 2026-07-26
---

## Mål
Push när en medlem ändrar en delad lista du är med i ("Anna bockade 3 saker på
Inköp"). Återanvänder samma push-rör som redan finns (`notifications`-kön →
`send-due`, se `reminder-push.md`, som är done). Samarbets-payoffen: du delar en
lista, du hör när den rör sig.

## Varför inte bara en trigger
Todo-appen sparar hela listan vid **varje** bock/tillägg, så en naiv
`AFTER UPDATE`-trigger blir pratig — flera notiser per sekund vid en redigering.
Kräver **coalescing** först: max en notis per lista, per medlem, per N minuter
(och inte till den som gjorde ändringen).

## Skiss
- En debounce/coalesce-nivå innan `notifications`-kön: antingen en
  `pending`-flagga per (lista, medlem) som `send-due`-ticken tömmer max var N:e
  minut, eller en `last_notified_at` som triggern respekterar.
- Text: sammanfatta ("N ändringar på 'Inköp'") snarare än en rad per bock.
- Prenumerationen är redan generell (per enhet, via `remind on`), så ingen ny
  opt-in behövs — men se `notify on`-idén i `reminder-push.md` för tydlighet.

## Levererat (2026-07-26)
Byggt. Besvarade öppna frågor:
- **Coalesce i `send-due`, inte i DB.** Triggern (`record_list_activity`) gör bara
  det triviala: loggar en rad per *content*-ändring i `shared_list_activity`
  (no-op-sparningar hoppas över via `is distinct from`). Själva coalescingen —
  och beslutet om *när* en burst är klar — bor i
  `supabase/functions/send-due/coalesce.ts`, ren och enhetstestad
  (`src/pia/list-activity.test.ts`), samma extraktionsknep som `cron.ts`.
- **Debounce + tak.** En lista levereras när den varit tyst i 3 min, men hålls
  aldrig kvar längre än 15 min (annars skulle en oavbrutet redigerad lista aldrig
  fyra). Efter leverans raderas radernas → färskt fönster nästa gång. Det ger
  "max en notis per lista, per medlem, per burst".
- **Inte till redigeraren.** `changesForRecipient` räknar bort mottagarens egna
  ändringar; två som redigerar samtidigt notifieras korrekt om varandras.
- **Text:** sammanfattning (`N updates to "Inköp"`), inte en rad per bock. Går via
  samma `notifications`-kö → `send-due`, så leverans/prune återanvänds oförändrat.
- **Ändringstyp:** varje content-ändring räknas (kan inte skilja omordning från
  tillägg utan att parsa listan — medvetet enkelt för v1).

Kvar (manuellt, kräver Supabase-åtkomst jag inte har i sessionen): applicera
`supabase/notifications.sql` och deploya om `send-due` mot live-projektet.

_Utbruten från `reminder-push.md` när den pucken markerades done; det här var den
genuint obyggda svansen._
