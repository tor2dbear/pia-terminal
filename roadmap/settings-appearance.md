---
title: Utseende i ~/.pia/config — egna färger, font, prompt
status: done
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

## Levererat (prompt-styling)
- **Prompten färgas per segment, zsh-stil:** `%F{token|#hex}…%f` (foreground),
  `%B…%b` (fet), `%%` (literalt %). En token → `var(--token)` (tema-medvetet),
  hex passerar rakt igenom. Valet blev zsh `%F{}` (läsbart + tema-medvetet)
  framför rå ANSI.
- Parsern (`terminal/prompt.ts`) ger styled-segment; renderaren bygger färgade
  spans via CSSOM (CSP-säkert) — både i **live-raden** och de **ekade**
  kommando-/`^C`/Tab-raderna (ny `printPromptLine`). Ekade prompter matchar nu
  live-promptens färger (`.term-echo-prompt` delar färg med `.term-prompt`).
- Seed-configen visar ett `%F`-exempel. Verifierat i riktig Chromium: en
  `%F`-prompt renderas med rätt färger per segment, utan CSP-fel.

## Öppna frågor
- Font-**filer** (egna `.woff`) krockar med CSP `font-src 'self'` — separat större
  grej; idag bara installerade fonter via namn.
- Ska custom font/size gälla även screen-appar (editor/pager), eller bara skalet?
  Idag `#screen` (skalet); apparna ärver där de kan.
