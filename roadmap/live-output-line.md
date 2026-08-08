---
title: "terminal: uppdaterbar utdatarad (progress/spinner)"
status: inbox
tags: [terminal, packages]
updated: 2026-08-08
---

## Mål
En primitiv för att **uppdatera en redan utskriven rad in-place** (en transient
rad som kan skrivas över), utan att ta över hela skärmen. Det är den delade
enablern bakom flera saker vi diskuterat men skjutit på framtiden — samlade här
så beslutet finns när någon av dem ska byggas.

## Research

### Luckan i dagens I/O
- `ctx.print` **appendar bara** en rad — kan aldrig ändra en redan skriven.
- Screen-appar (`ctx.runApp`) **tar över hela skärmen** — för mycket för en
  progressrad mitt i normalt flöde.
- Mellanläget — "skriv en rad och uppdatera den några gånger" — saknas helt
  (verifierat: ingen spinner/transient/updateLine-primitiv finns i
  `src/terminal/`).

### Vad som behöver den
- **`brew install` Nivå 2b** (se `brew-install-progress.md`): en animerad
  spinner/bar *under* den äkta chunk-`import()`-hämtningen. Mest värde för tunga
  paket (`python`/pyodide) där laddningen faktiskt tar tid — där är animationen
  ärlig, inte kosmetik.
- **`pv -L <rate>`** (se `pkg-pv.md`): ärligt portionerad genomströmning med en
  bar som fylls sanningsenligt.
- **Framtida live-kommandon:** `tail -f`, `yes`, spinners, live-filter.

### Skiss på API (bakom context-sömmen — kommandon rör aldrig DOM)
```
ctx.progress(label?) → handle {
  update(text)      // skriv om raden in-place
  done(finalText?)  // fäst slutraden, sluta vara transient
}
```
En rad, uppdaterbar tills `done()`. Kommandon fortsätter tala med världen bara
via `CommandContext` — primitiven lever i terminal-kärnan (Terminal), inte i
kommandot.

### Determinism (viktigast)
Rendera **inga mellanframes** när output fångas (pipe/redirect) eller i touren —
visa bara slutraden. Exakt som `matrix`/`ping` redan hanterar sina
icke-deterministiska lägen. Så golden-snapshoten förblir stabil och captured
output blir ren text.

## Avgränsning
- **Inte** full skärm-takeover — det är `ScreenApp`.
- **Inte** strömmande pipes — det är en mycket större arkitekturfråga (för/emot
  vägt i `pkg-pv.md`). Den här primitiven ger animerad *lokal* output utan att
  röra pipeline-modellen.

## Kopplingar
- `brew-install-progress.md` — Nivå 2b (animerad bar) väntar på den här.
- `pkg-pv.md` — `pv -L` (ärlig animation) och streaming-pipes (far-term).

## Insats
M — en avgränsad tillägg i terminal-kärnan + en context-metod. Ingen
pipeline-ombyggnad.
