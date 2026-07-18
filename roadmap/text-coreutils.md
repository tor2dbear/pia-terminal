---
title: sort / uniq / cut — pipe-kompanjonerna
status: done
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

## Levererat
Alla tre i `text.ts`, kring en delad `allLines`-hjälpare (läser filer *eller*
stdin via `sourcesOf`, plus `toLines`), så de komponerar:
`cat data.csv | cut -d, -f1 | sort | uniq -c`.
- **`sort`** — lexikalisk default; `-r` omvänt, `-n` numeriskt (jämför på
  ledande tal), `-u` unikt (efter sortering).
- **`uniq`** — kollapsar *intilliggande* dubbletter (kräver sorterad input, som
  GNU — noterat i `help`); `-c` prefixar antal (samma bredd som `wc`), `-d` bara
  dubbletter.
- **`cut`** — `-f <lista>` med `-d <delim>` (default TAB), eller `-c <lista>`.
  Listor: `1`, `1,3`, `2-`, `-4`, `2-5`. Emitterar alltid i *input-ordning*
  (`-f3,1` → fält 1 sen 3), och en rad utan delimiter skickas igenom hel (GNU
  utan `-s`).

Täckt av 10 kommandotester (sort lexikal/`-r`/`-n`/`-u`; uniq/`-c`/`-d`; cut
fält-ordning/öppna intervall/`-c`/ingen-delim/fel utan lista). 287 tester gröna;
typecheck + build gröna. (Autosuggestion-testet uppdaterat: `cut` är en ny
`c`-completion.)

_`sort -k`, `cut -s`, och teckenkodnings-nyanser kvar om behovet dyker upp._
