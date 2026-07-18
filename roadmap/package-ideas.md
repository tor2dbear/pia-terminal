---
title: Paket-roadmap — brew-appar som passar PIA
status: inbox
tags: [packages, overview]
updated: 2026-07-18
---

## Vad som gör ett bra PIA-paket
- **On-brand:** Unix-idiom, "lär dig terminalen", eller kul liten dator.
- **Helt klientsidan:** strikt CSP (ingen tredjeparts-`connect-src`) ⇒ **inga
  nätverkspaket**. Web Audio och rena algoritmer är OK.
- **Självständigt:** en mapp under `src/packages/`, egen lazy-chunk.

## Katalog idag (klart)
`snake` · `2048` · `draw` · `cowsay` · `cal` · `bc` · `fortune` · `sl` ·
`cmatrix` · `tutor` · `life` · `tetris` · `qr`.

## Kandidater (S/M/L = insats)

**Unix-klassiker**
- `cal` (S) · `bc` (S) · `qr` (M, QR av en share-länk) · `figlet` (S–M) ·
  `fortune` (S) · `sl` (S) · `cmatrix` (S) · `rev`/`factor`/`base64`/`xxd` (S).

**Arkad (screen-appar)**
- `tetris` (M) · `minesweeper` (M) · `life` (S) · `wordle` (S–M) ·
  `sudoku` (M) · `hangman` (S) · `sokoban` (M).

**Lär dig terminalen (PIA:s själ)**
- `tutor` (M) — interaktiv terminal-kurs 🎯 · `vim` (L) — modal editor ·
  `sed`/`awk` (M) · `man` (S–M) — fylligare manualsidor.

**Kreativt / dev**
- `piano` (M, Web Audio) · `asciiquarium` (S–M) · `jq` (M) · `diff` (S).

## Rekommenderad ordning
1. ~~`cal` + `bc` + `fortune`~~ — **klart** (första omgången, egna lazy-chunks,
   med i touren).
2. ~~`sl` + `cmatrix`~~ — **klart** (animerade screen-appar).
3. ~~`tutor` 🎯~~ — **klart** (8-lektioners syntax-kurs, screen-app).
4. ~~`life` + `tetris`~~ — **klart** (arkad screen-appar).
5. ~~`qr`~~ — **klart** (QR av text/share-länk; vetat bibliotek, jsqr-verifierat).

**Hela ordningen 1–5 är levererad.** Resten av kandidaterna ovan bor här tills de
befordras. Nästa stora mål: `python` (Pyodide/iframe) — se `python-wasm.md`.
