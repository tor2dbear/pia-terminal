---
title: AI-värd-persona (och ev. ask-kommandot)
status: inbox
tags: [persona, ai]
updated: 2026-08-08
---

## Mål
(Research.) README:s öppna fråga sedan start: en namngiven "diskret värd" — en
AI-persona som hälsar vid boot och svarar torrt ibland. Plus Nivå 4:s
`ask <fråga>`. Den här pucken slår ihop dem, för det är samma tråd: **karaktär,
inte nytta.**

## Research
- **Persona ≠ LLM.** Värden kan vara ren karaktär: skriptade/torra repliker vid
  boot och i vissa lägen, helt utan modell. Det är kul, on-brand och gratis att
  köra. Börja där.
- `ask <fråga>` (en LLM som svarar i terminalen) är motsatsen till det som sades
  i AI-kontext-spåret ("inte att en LLM ska *bo* i terminalen, iaf initialt").
  Som *nytta* är det commodity-drift — wrappar bara en modell, och drar in nyckel
  + kostnad (web-divergens).
- Omframat som **persona-röst** blir `ask` däremot on-brand: inte "en assistent",
  utan värdens karaktär som råkar kunna svara. Det är skillnaden mellan commodity
  och lek.
- Koppling: `ai-mcp-context` handlar om filer *ut* till en extern AI. Den här
  handlar om en röst *in* i PIA. Olika riktningar — förväxla inte.

## User stories
Riktningen **en röst *in* i PIA** (motsatt `ai-mcp-context`, som skickar filer
*ut*). Ramen är persona, inte assistent — se research ovan.

- **US 1 — värden hälsar med karaktär (ingen modell).**
  *Som* återvändande användare *vill jag* mötas av en torr, skriptad rad vid boot
  *så att* PIA känns som en *någon*, inte ett tomt skal. Ren karaktär, gratis att
  köra — **bygg den här delen först.**
- **US 2 — fråga värden om mina egna filer (`ask`, om lusten finns).**
  *Som* van terminalanvändare *vill jag* skriva `ask "sammanfatta todo.md som tre
  punkter"` *så att* jag får svar där jag redan är, med tillgång till min VFS.
  On-brand bara som **värdens röst** (inte "en assistent") — annars commodity-drift.
  Drar in nyckel/kostnad (web-divergens): flagga före bygge, se öppna frågor.

## Öppna frågor
- Namn på värden (README lämnade det öppet).
- Räcker skriptad persona (ingen modell) för det mesta av charmen? Troligen ja —
  bygg den delen först, LLM-`ask` bara om lusten finns.
- Om `ask` med modell: nyckel/kostnad-modellen (BYOK? proxy?) — samma
  web-divergens som i `ai-mcp-context`, flagga före bygge.

_Ligger i `inbox`; persona-delen kan befordras utan att `ask` följer med._
