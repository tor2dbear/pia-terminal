---
title: Globbing — * och ? på shell-nivå
status: next
tags: [shell, terminal]
updated: 2026-07-17
---

## Mål
Låt `*` och `?` expanderas mot VFS:en *innan* ett kommando körs, så
`cat *.md`, `ls src/*`, `rm *.txt` funkar. Idag är de vanliga tecken — den
enskilt största shell-luckan, och den bryter "riktig terminal"-känslan mest.

## Research
- **Var det saknas:** `tokenize`/`lex` i `src/terminal/parse.ts` behandlar `*`/`?`
  som vanlig text; ingen expansions-pass finns. Globbing existerar bara *inuti*
  `find -name` och som regex i `grep` — via `globToRegExp` i
  `src/commands/text.ts`, som kan återanvändas.
- **Var det hör hemma:** en expansions-pass per pipeline-stage, efter tokenisering
  men före kommandot körs — expandera varje token som innehåller `*`/`?` mot
  `cwd`/VFS, sortera träffarna. Rider på `CommandContext`-sömmen; kommandon
  behöver inte veta något.
- **Idiom-detaljer att härma:** ingen träff → token lämnas orörd (bash default,
  `nullglob` av). Dolda filer (punkt-prefix) matchas *inte* av ett inledande `*`
  (som riktiga skal). `?` = exakt ett tecken.
- Citat stänger av globbing: `"*.md"` ska förbli literalt (tokenizern spårar redan
  citat).

## Öppna frågor
- Expandera i alla stages eller bara mot filargument? Alla stages, som bash.
- Rekursiv `**`? Hoppa först — vanlig `*` täcker nästan allt behov.
- Matchning mot `/`: ett `*` ska inte korsa mappgränser (`src/*` ≠ `src/**`).
  Spika mot bash-beteende innan bygge.

_Ligger i `next` — störst effekt av grund-luckorna, men shell-core så värt omsorg._
