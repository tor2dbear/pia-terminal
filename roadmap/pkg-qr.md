---
title: paket: qr — QR-kod som ASCII
status: done
tags: [packages]
updated: 2026-07-18
---

## Mål
`qr <text>` — genererar en QR-kod som ASCII-block, **ren algoritm, inget
nätverk**. Knyter ihop med `share`/`publish`: gör en QR av en delnings-länk.
Insats: M (QR-kodning är lite mattigt men self-contained).

## Levererat
`brew install qr`. `qr [-l|-m|-q|-h] <text>` (eller pipa in text, så
`share notes.txt`-URL:en kan flöda in) visar en QR-kod som en screen-app —
half-block-tecken i en tight `<pre>` (line-height 1) med 4-moduls tyst zon, så
den faktiskt går att skanna. Byte-mode, UTF-8, auto-vald version. `^X` stänger.

## Beslut: vetat bibliotek istället för handrullat (accepterad divergens)
Till skillnad från övriga paket (alla handrullade) bygger `qr` på
**`qrcode-generator`** — ett pyttelitet, beroendefritt MIT-bibliotek. QR är en
knepig standard (Reed–Solomon, maskning, format/versionsinfo) som är lätt att få
subtilt fel och **omöjlig att verifiera visuellt** i en huvudlös miljö. En
handrullad encoder byggdes först men konvergerade inte mot skanningsbar output
under tidsbudgeten; risken att skeppa en tyst trasig QR var för hög.

- **Beroendet är lazy:** det bor bara i `qr`-chunken (egen ~23 kB-chunk), aldrig
  i huvudbundlen förrän man `brew install qr`. Same-origin efter bundling → inom
  strikt CSP.
- **Korrekthet bevisas:** ett round-trip-test avkodar varje genererad kod med en
  riktig QR-läsare (`jsqr`, devDependency) för L/M/Q/H + UTF-8 — så vi vet att
  koderna skannar, inte bara att de "ser ut som" QR.
- PIA:s första runtime-beroende utöver Supabase. Flaggat som medvetet val, i
  samma anda som share→URL-divergensen — inte drift.

_En framtida variant skulle kunna ersätta biblioteket med en egen encoder om vi
har tid att verifiera den ordentligt (jsqr-round-trip finns redan som skyddsnät)._
