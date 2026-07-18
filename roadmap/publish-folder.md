---
title: publish — mappar blir en publik sida
status: later
tags: [share, web]
updated: 2026-07-17
---

## Mål
`publish <mapp>` gör `.md`-filerna i en mapp till en liten publik, statisk sida
med egen URL. En läs-vy för omvärlden, byggd av det du redan skrivit i
terminalen.

## Research
- Rider på befintligt delnings-idiom. `share <fil>` → URL finns redan
  (self-contained hash för guests, cloud-delning för inloggade). `publish` är
  mappnivån av samma sak: en samling `.md` → en renderad sida.
- **Web-divergens (accepterad):** `publish`→URL har ingen Unix-motsvarighet, står
  redan som accepterad avvikelse i CLAUDE.md bredvid `share`.
- Rendering finns halvvägs: `glow` renderar redan `.md` i terminalen. En publik
  sida vill ha HTML — pure `renderMarkdown` kan ev. återanvändas, men målformatet
  skiljer (terminal-rader vs HTML).

## Öppna frågor
- Var bor den publika sidan? Cloudflare Pages-funktion, en Supabase-rad + enkel
  renderare, eller hash-URL som `share`?
- En sida per mapp, eller en flersidig site (index + undersidor)?
- Kräver `publish` inloggning, eller funkar en hash-variant för guests?
- Portfolio-vinkel: visar static-gen — medel värde. Prioritera efter Nivå 2-
  apparna om de lockar mer.

_Ligger i `later`. Befordra till `next` när en verklig lust finns._
