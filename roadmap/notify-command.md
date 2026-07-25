---
title: "notify on — eget notis-preferenskommando"
status: inbox
tags: [scheduling, push]
updated: 2026-07-25
---

## Mål
Ett eget `notify on/off`-kommando för att slå på/av push-notiser, i stället för
att aktivera dem som en sidoeffekt av `remind on`.

## Scope (ärligt)
- **`notify on`** är i praktiken bara ett tydlighets-/upptäckbarhets-omslag —
  återanvänder befintliga `enablePush()`/`isEnabled()` (`src/pia/reminders.ts`).
- **`notify off` är däremot ny funktion.** `ReminderStore` har idag ingen
  disable-väg, och Supabase-adaptern varken anropar `PushSubscription.unsubscribe()`
  eller raderar enhetens `push_subscriptions`-rad. Off kräver alltså:
  - ett nytt `disablePush()` i `ReminderStore`-seamen (Null/Memory/Supabase),
  - browser-sidan: hämta prenumerationen och `.unsubscribe()`,
  - persistens: ta bort raden i `push_subscriptions` (RLS på `auth.uid()`).

## Skiss
- `notify` (utan arg) → status ("notiser: på/av på den här enheten") via `isEnabled()`.
- `remind on` blir ett alias eller pekar vidare till `notify on`.

## Öppna frågor
- Ska `off` ta bort prenumerationen helt (påverkar alla notis-typer) eller bara
  pausa? Rimligen ta bort — enkelt och ärligt, men det är just den delen som är
  ny kod (se scope ovan).
- Hör `notify` hemma i kärnan eller i samma seam som `remind`/`ReminderStore`?

_Utbruten från `reminder-push.md` när den markerades done; en liten kvarvarande
tydlighets-svans._
