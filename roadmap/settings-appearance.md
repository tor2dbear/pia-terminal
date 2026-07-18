---
title: Utseende i ~/.pia/config — egna färger, font, prompt
status: now
tags: [config, theme]
updated: 2026-07-18
---

## Mål
Göra `~/.pia/config` till en *riktig* settings-fil som i iTerm/Alacritty/kitty:
egna hex-färger och font (inte bara de fyra färdiga temana), och ett
terminaltroget sätt att styla prompten.

## Levererat (färger + font)
- **Egna färger** överlagrar valt tema: `color.<token> = #hex` för `bg fg dim
  accent error`. Validerad hex (3/6/8 siffror); ogiltiga värden ignoreras.
- **Font + storlek:** `font = "Namn", monospace` (installerat teckensnitt via
  namn) och `font-size = N` (8–40 px). `#screen` läser `var(--font-size, 14px)`.
- Appliceras via CSSOM (`setProperty` på `documentElement`) ovanpå temat — samma
  CSP-säkra mekanism som `theme`-kommandot. Borttagen override faller tillbaka
  (färger via `applyTheme`, font via `removeProperty`).
- **`source ~/.pia/config`** (alias `.`) — läser om configen och applicerar direkt
  efter en hand-edit (`nano ~/.pia/config`), utan reload. Äkta rc-idiom
  (`source ~/.bashrc`). Vägrar allt utom config-filen (PIA kör inga skript).
- Seed-configen visar nu exempel på `color.*`, `font`, `font-size`.

## Kvar: prompt-styling (nästa PR)
Terminaltroget sätt att färga prompten per segment (user grön, cwd blå …).
Kandidater: zsh `%F{...}%f` (läsbart, modernt), rå ANSI `\e[…m` (mest äkta men
otympligt), eller egen `{token|färg}`-syntax. Luta åt **zsh `%F{}`** med
palett-token *eller* hex som färg. Kräver att prompt-renderaren bygger flera
färgade spans (både i live-raden och de ekade rad-/`^C`-raderna).

## Öppna frågor
- Font-**filer** (egna `.woff`) krockar med CSP `font-src 'self'` — separat större
  grej; idag bara installerade fonter via namn.
- Ska custom font/size gälla även screen-appar (editor/pager), eller bara skalet?
  Idag `#screen` (skalet); apparna ärver där de kan.
