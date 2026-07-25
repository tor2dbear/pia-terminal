---
title: '"Lista uppdaterad"-notiser (coalescade)'
status: inbox
tags: [collaboration, push]
updated: 2026-07-25
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

## Öppna frågor
- Coalesce i DB (trigger + tidsstämpel) eller i `send-due` (gruppera köade rader)?
- Notifiera vid varje ändringstyp, eller bara tillägg/klart (inte omordning)?

_Utbruten från `reminder-push.md` när den pucken markerades done; det här är den
genuint obyggda svansen._
