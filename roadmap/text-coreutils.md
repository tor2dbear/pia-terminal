---
title: sort / uniq / cut — pipe-kompanjonerna
status: later
tags: [text, commands]
updated: 2026-07-17
---

## Mål
De klassiska text-verktygen som gör pipes kraftfulla: `sort`, `uniq`, `cut`. De
kompletterar `grep`/`wc` ni redan har — utan dem är pipelines svaga. Grupperad
puck (2B-beslut); dela vid bygge om nån växer.

## Research
- **Var det hör hemma:** `src/commands/text.ts`, samma `sourcesOf`-mönster (fil
  eller stdin), så de komponerar: `cat data.csv | cut -d, -f1 | sort | uniq -c`.
- **`sort`** — rader lexikaliskt; `-r` omvänt, `-n` numeriskt, `-u` unikt. `-n`
  måste hantera icke-numeriska rader (bash sorterar dem som 0/först — spika mot
  GNU).
- **`uniq`** — kollapsar *intilliggande* dubbletter (kräver sorterad input, som
  riktiga uniq — dokumentera det, "gör inte magi"). `-c` prefixar antal, `-d`
  bara dubbletter.
- **`cut`** — `-d <delim>` + `-f <fält>` (t.ex. `-f1,3` eller `-f2-`). `-c` för
  teckenintervall. Default-delim är TAB, som riktiga cut.

## Öppna frågor
- `sort -k` (sortera på kolumn) — nisch, hoppa först.
- `cut`s fält-syntax (`1,3`, `2-`, `-4`) — hur mycket täcker vi? Börja med enkla
  listor och `n-`-intervall.
- Ska `uniq` varna/tolerera osorterad input, eller tyst följa GNU (bara
  intilliggande)? Följ GNU, men överväg en not i `help`.

_Ligger i `later`. Bygg gärna en i taget även om pucken är grupperad._
