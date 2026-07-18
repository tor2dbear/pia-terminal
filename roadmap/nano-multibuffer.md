---
title: "nano: multi-buffer"
status: done
tags: [editor]
updated: 2026-07-18
order: 10
---

## Mål
Kunna ha flera filer öppna samtidigt i `nano` och växla mellan dem, istället
för en buffer i taget. Riktiga nano har `^R` (Read File in i ny buffer) och
`M-<`/`M->` för att bläddra mellan buffrar.

## Levererat
- **Flera buffrar öppnas med `nano a b c`** (en buffer per filargument, äkta
  nano-beteende). Blandat lokala och delade (👥) filer funkar — varje fil får sin
  egen spara-callback.
- **Växling** med `M-,`/`M-.` (och `M-<`/`M->`), plus tappbara `«`/`»` på key-baren.
  Titelraden visar `[ n/m ]` när fler än en buffer är öppen.
- **`^X` stänger aktuell buffer**; sista stängningen avslutar editorn. Osparade
  ändringar vaktas *per buffer* (`^X` en gång → varning med filnamnet, `^X` igen →
  släng, `^O` → spara), precis som nano frågar per buffer vid avslut.
- Multi-buffer bor **inuti** editor-appen (en `Buffer[]` + aktivt index), rör inte
  `ScreenApp`-hosten — som forskningen lutade åt.

## Beslut på öppna frågor
- **M-tangent-krocken:** löst genom att matcha på fysisk tangent (`e.code` =
  `Comma`/`Period`) istället för tecken — layout-oberoende och undviker att
  macOS-Alt ger ett specialtecken. **Tappbara `«`/`»` på baren är den definitiva
  fallbacken** (mobil + vilken webbläsare som helst, ingen Meta behövs). Verifierat
  genom jsdom-tester som kör hela Terminal-input-loopen samt boot-check i riktig
  Chromium utan runtime-/CSP-fel.
- **Före cloud-sync?** Byggdes fristående; ingen koppling till sync, ingen risk.

## Ev. följd (ej gjort, valfritt)
- `^R` — läs in *ytterligare* en fil i en ny buffer *inifrån* editorn. Kräver ett
  litet filnamns-prompt-läge i statusraden (modal input). Utanför detta måls
  kärna ("flera öppna samtidigt + växla"), sparat som egen liten idé om lusten
  finns.
