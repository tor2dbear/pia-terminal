---
title: "brew install: ärlig installationsceremoni"
status: done
tags: [packages, system]
updated: 2026-08-31
---

## Levererat (Nivå 1 + 2)
`brew install <name>` visar nu de riktiga stegen istället för en enda rad:
`==> Fetching <name>… (8.6 kB)` (brackettar den äkta dynamiska
`import()`-hämtningen, med paketets **verkliga gzip-storlek**) →
`==> Registering: <commands>` → `installed <name> ✓`. Ingen påhittad tid — bara
de steg som faktiskt händer.

**Nivå 2-mekanik:** en vite-plugin (`packageSizes` i `vite.config.ts`) räknar
varje pakets gzip-chunkstorlek i `generateBundle` och emitterar
`package-sizes.json`. Storleken finns bara *efter* bundling, så den kan inte bli
en compile-time `define` som `VERSION` — den byggda appen fetchar assetten
same-origin (CSP `connect-src 'self'`, likt `ping`) via `src/packages/sizes.ts`,
memoiserat och best-effort (null → storleken utelämnas). Grindat på
`import.meta.env.PROD`, så dev/test/tour aldrig fetchar → deterministiskt.

Verifierat i prod-bygget 2026-08-31 (headless Chromium): `brew install python`
skriver `==> Fetching python… (2.3 kB)` → `==> Registering: python` →
`installed python ✓`, och `/package-sizes.json` serveras på prod (200).

**Kvar — men inte i den här pucken:**
- **Nivå 2b** (animerad bar/spinner) lever vidare som egen puck:
  `live-output-line.md`. Det är den som är det öppna spåret.
- **Nivå 3** (kosmetisk pacing) — **avvisad**, enligt default. Vi fejkar inte tid;
  samma linje som för äggen och `pv`.
- **`apt`-flavored etiketter** och en ceremoni för `brew uninstall` är kvar som
  små, ej beslutade idéer — plocka upp dem tillsammans med `live-output-line`
  om det blir aktuellt.

Det beslutade spåret (Nivå 1 + 2) är levererat och i produktion → `done`.

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

## Öppna frågor (avgjorda)
- **Nivå 3 (kosmetisk sleep):** ❌ avvisad — vi fejkar inte tid.
- **Storleks-manifest:** ✅ löst — vite-pluginen `packageSizes` räknar gzip-storleken
  i `generateBundle` och emitterar `package-sizes.json`, som prod-bygget fetchar
  same-origin.
- **Determinism i touren:** ✅ löst — storleken visas bara i `PROD`, så touren
  (dev/test) skriver `==> Fetching <name>…` utan siffra och guldfilen är stabil.
- **Uninstall-ceremoni / `apt`-etiketter:** ej beslutat, flyttat till spåret ovan.
