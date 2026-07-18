---
title: at / crontab — schemalagt (fd "remind")
status: done
tags: [commands, scheduling]
updated: 2026-07-18
---

## Mål
(Research/idiom-beslut.) README:s Nivå 3 hade `remind`/schemalagt. Riktiga
terminalnamnet är **`at`** (engångs) och **`crontab`** (återkommande), inte
`remind`. Byggd som **lärverktyg** (vinkel spikad — se nedan).

## Levererat (lärverktyg, in-flik)
- **`at <tid> <kommando>`** schemalägger ett engångsjobb (`at now+5m echo hi`,
  `at 14:30 …`); `at -l` listar (UTC-tider), `at -r <n>` tar bort.
- **`crontab -e`** (redigera i nano) / **`-l`** (lista) / **`-r`** (ta bort).
  Cron-syntax: fem fält `min tim dag mån veckodag` + `command`, med `*` `*/n`
  `a-b` `a,b`. Validering varnar för trasiga rader.
- Jobben bor i VFS-filer (`~/.pia/at`, `~/.pia/crontab`). En **scheduler**
  (`pia/scheduler.ts`) tickar varje sekund medan fliken är öppen och kör due
  jobb genom terminalen (`Terminal.fireScheduled` — en `⏰`-markör, kör, utan att
  förstöra din halvskrivna rad). Ren cron-/tid-matte i `pia/cron.ts` (testad).
- **Ärlig gräns:** fyrar bara medan fliken är öppen. Den "riktiga" push-versionen
  (även när fliken är stängd) ligger som egen puck (`reminder-push`).

## Vinkel-beslut
Byggt som **terminal-lärande** (lär dig `at`/cron-syntax i en sandlåda) — litet,
on-brand, ingen backend. *Påminnelsetjänsten* (backend + push) är en separat,
större sak → `reminder-push`-pucken.

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
