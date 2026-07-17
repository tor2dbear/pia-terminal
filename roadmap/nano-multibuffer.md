---
title: "nano: multi-buffer"
status: next
tags: [editor]
updated: 2026-07-17
order: 10
---

## Mål
Kunna ha flera filer öppna samtidigt i `nano` och växla mellan dem, istället
för en buffer i taget. Riktiga nano har `^R` (Read File in i ny buffer) och
`M-<`/`M->` för att bläddra mellan buffrar.

## Research
- Riktiga nano visar `[ 2/3 ]` i statusraden för att markera buffer-position.
  Enkelt att härma och kommunicerar läget direkt.
- `ScreenApp`-hosten äger just nu en buffer. Frågan är om multi-buffer ska bo
  *inuti* editor-appen (den håller en lista av buffrar) eller om hosten ska
  kunna hålla flera app-instanser. Editor-intern känns renare och rör inte
  hosten — luta åt det.
- `^X` (Exit) med osparade ändringar i *någon* buffer: nano frågar per buffer
  vid avslut. Måste hanteras så vi inte tappar osparat.

## Öppna frågor
- Tangentbindningar: `M-<`/`M->` kräver Alt/Meta som kan krocka med webbläsaren.
  Testa i riktig browser innan vi spikar; ev. fallback-bindning.
- Behövs det här före cloud-sync, eller är det en trevlighet som kan vänta?
  Håll i `next`, inte `now`, tills en verklig användning kräver den.
