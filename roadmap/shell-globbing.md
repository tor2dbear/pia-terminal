---
title: Globbing — * och ? på shell-nivå
status: done
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

## Levererat
Ny ren modul `src/terminal/glob.ts` (`expandArg`/`expandArgs` + en liten
`GlobFs`-söm, testbar utan VFS). `executePipeline` i `terminal.ts` expanderar
args *efter* alias-expansion, som ett riktigt skal. Så här landade frågorna:
- **Citat stänger av globbing:** löst i `parse.ts` — en `*`/`?` som skrivs *inom*
  citat byts mot en sentinel (privat unicode-tecken) i tokenizern, så `"*.md"`
  når kommandot literalt. Sentineln städas bort (`unescapeWild`) innan args
  lämnas vidare, så inget kommando ser den. Normala tokens är byte-identiska —
  alla gamla parse-tester gröna orörda.
- **nullglob av:** ingen träff → token lämnas orörd (`*.zip` → `*.zip`).
- **Dolda filer:** ett ledande `*`/`?` matchar inte punkt-filer; ett *literalt*
  ledande `.` (som `.*`) gör det.
- **`?`** = exakt ett tecken. Träffar sorteras.
- **Alla stages** expanderas (inte bara filargument), som bash. Det ger rätt
  idiom-beteende även på gotchas: `find . -name *.md` *osciterat* expanderar och
  bråkar (precis som riktiga skal) — citera för att skydda mönstret.
- **v1-avgränsning:** bara *sista* path-segmentet globbar (`*.md`, `src/*.ts`).
  Wildcard i ett tidigare segment (`*/x.md`) lämnas literalt — ingen
  mappöverskridande `*` eller `**` än. Redirect-mål (`> fil`) expanderas inte,
  bara av-sentinelas.

Täckt av 12 enhetstester (`glob.test.ts`) + 4 integrationstester genom hela
terminalen (`terminal.test.ts`): expansion, citat-skydd, no-match-literal, och
att expanderade filer faktiskt matas till kommandot. 252 tester gröna;
typecheck + build gröna; boot verifierad i headless Chromium utan runtime-fel.

_`**`, mappöverskridande wildcards och redirect-mål-globbing är kvar som möjlig
uppföljning om behovet dyker upp._
