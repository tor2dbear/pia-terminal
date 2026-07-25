---
title: "notify on — eget notis-preferenskommando"
status: inbox
tags: [scheduling, push]
updated: 2026-07-25
---

## Mål
Ett eget `notify on/off`-kommando för att slå på/av push-notiser, i stället för
att aktivera dem som en sidoeffekt av `remind on`. Prenumerationen (per enhet,
via `pushManager.subscribe`) är redan generell och gäller alla notis-typer —
det här är bara ett tydlighets-/upptäckbarhets-val, inte ny funktion.

## Skiss
- `notify on` → samma `enablePush()` som `remind on` idag; `notify off` avregistrerar
  enhetens prenumeration.
- `notify` (utan arg) → visar status ("notiser: på/av på den här enheten").
- `remind on` kan bli ett alias eller peka vidare till `notify on`.

## Öppna frågor
- Ska `off` ta bort prenumerationen helt (påverkar alla notis-typer) eller bara
  pausa? Rimligen ta bort — enkelt och ärligt.
- Hör `notify` hemma i kärnan eller i samma seam som `remind`/`ReminderStore`?

_Utbruten från `reminder-push.md` när den markerades done; en liten kvarvarande
tydlighets-svans._
