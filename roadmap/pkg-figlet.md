---
title: "paket: figlet — stora ASCII-banners"
status: done
tags: [packages, fun]
updated: 2026-07-25
---

## Mål
`figlet <text>` — skriver texten som en stor ASCII-banner. On-brand terminal-konst,
snyggt & screenshottbart (`figlet PIA`). Insats: S–M.

## Levererat
`brew install figlet`. Ett kompakt 5-raders block-typsnitt (A–Z, 0–9, mellanslag
och lite skiljetecken) författat inline — inget externt typsnitt, så paketet är
självständigt och CSP-säkert. Ren `figlet(text)` returnerar 5 rader (gemener →
versaler, okänt tecken hoppas över); kommandot skriver dem i accent. Skriver till
scrollback (ingen screen-app). Enhetstest (5 rader, kolumn-justering,
case-mappning, okänt tecken).
