---
title: "brew install: ärlig installationsceremoni"
status: now
tags: [packages, system]
updated: 2026-08-08
---

## Levererat (Nivå 1)
`brew install <name>` visar nu de riktiga stegen istället för en enda rad:
`==> Fetching <name>…` (brackettar den äkta dynamiska `import()`-hämtningen)
→ `==> Registering: <commands>` → `installed <name> ✓`. Ingen påhittad tid eller
bar — bara de steg som faktiskt händer. Test i `brew.test.ts` + touren.
**Kvar:** Nivå 2 (verklig gzip-chunkstorlek via bygg-manifest, injicerat likt
`VERSION`) och den öppna Nivå 3-frågan (kosmetisk pacing).

## Mål
Ge `brew install` en känsla av att något faktiskt *installeras* — men **ärligt**,
inte som en fejkad nedladdningsbar. Idag komprimeras installen till en osynlig
blink + en rad. Observationen som väckte det: man saknar att saker "installeras".

## Research

### Det finns redan ett äkta async-moment
`brew install <name>` (`src/commands/brew.ts:50`) kör `registerPackage`, som
anropar `entry.load()` = `() => import("./cowsay/index.js")` — en **riktig
dynamisk import av en separat JS-chunk**. Det är en genuin async-hämtning av ett
verkligt artefakt med en verklig storlek (samma chunkar man ser i
`npm run build`-outputen, t.ex. `cowsay` ~X kB gzip).

Stegen som faktiskt händer idag:
1. `import()` av chunken — riktig fetch + parse, verklig storlek.
2. Registrerar kommandon i registret.
3. Skriver `~/.pia/packages`, persistar.
4. Skriver *en* rad: `installed cowsay — commands: cowsay, cowthink`.

Alla fyra är verkliga. Ceremonin finns liksom redan — den visas bara inte. Därför
kan en progress-känsla ges *ärligt*. Det här är den "Option C" som pv saknade i
pipes (mätare framför något genuint async) — `brew install` **är** den producenten.

### Tre nivåer
- **Nivå 1 — visa de riktiga stegen (ren ärlighet).**
  ```
  $ brew install cowsay
  ==> Fetching cowsay…          ← under den riktiga import()
  ==> Registering: cowsay, cowthink
  installed cowsay ✓
  ```
  Ingen påhittad fördröjning — bara en obestämd spinner medan den *faktiska*
  importen pågår (en `import()` ger ingen byte-progress, så obestämt = det ärliga).
  Billigt, ren vinst; stegen finns redan.

- **Nivå 2 — ärlig storlek + bar.**
  Injicera varje chunks *verkliga* gzip-storlek vid bygget (samma mönster som
  `VERSION` redan injiceras — en liten vite-plugin som skriver ett
  storleks-manifest). Då kan installen visa en determinerad bar mot den **sanna**
  siffran: `cowsay  ▓▓▓▓▓▓▓▓▓▓  8.6 kB`. Baren fylls snabbt (importen är nära
  direkt), men siffran är *äkta bytes, inte vibbar*. Det är den eleganta detaljen.

- **Nivå 3 — kosmetisk pacing (gränsen).**
  Padda med en konstgjord sleep så baren glider långsammare = att fejka tid.
  Exakt linjen vi drog för äggen och pv.

### `apt`-aliaset
`brew` har redan `apt` som alias. Riktiga `apt` har sin egen ceremoni
("Get:1… Unpacking… Setting up…"). Ett `apt install` skulle kunna spegla pia:s
*verkliga* steg med apt-flavored etiketter — ärligt, för stegen händer på riktigt.
Fin idiom-detalj utan lögn.

## Beslutat spår
- **Nivå 1:** ja — billig, ärlig, ren vinst.
- **Nivå 2:** ja i mån av bygg-stöd — det är där "äkta bytes"-magin sitter.
  Kräver storleks-manifest injicerat vid bygget.

## Öppna frågor
- **Nivå 3 (kosmetisk sleep):** avvisa rakt av, eller tillåt som ett *dokumenterat*
  ceremoni-beslut (accepterad divergens à la `share→URL`)? Default: avvisa.
- **Storleks-manifest:** hur surfa den verkliga gzip-chunkstorleken vid bygget
  (vite-manifest/plugin)? Genomförbarhet + hur den matas in i runtime (som
  `VERSION`).
- **Determinism i touren:** importens timing är icke-deterministisk. Visa
  *storlek* (deterministiskt) snarare än tid, eller redigera progress-raderna i
  golden så touren förblir stabil.
- **Uninstall:** ska `brew uninstall` få en motsvarande (kort) ceremoni, eller
  hålla sig till dagens enda rad?
