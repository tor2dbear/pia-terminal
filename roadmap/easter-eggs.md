---
title: "påskägg: policy + shortlist"
status: inbox
tags: [system, packages]
updated: 2026-08-08
---

## Mål
Bestäm hur pia förhåller sig till **påskägg** — de dolda skämt-/lek-svar som
portfolions terminaltema (`tor2dbear/portfolio`) har en hel katalog av, indexerad
bakom ett dolt `easteregg`-kommando. Frågan är inte "vilka skämt ska vi lägga in"
utan "vilken sorts ägg får plats i en maskin som säger sig vara riktig". Det här
är en policy-puck: den fastslår regeln först, så eventuella divergenser blir
*beslut, inte drift* (jfr CLAUDE.md, "terminal-idiom first").

## Research

### Vad portfolion har
Katalog i `assets/js/terminal-data.js` (`TERMINAL_EASTER_EGGS`) + implementation
i `assets/js/terminal.js`, grupperad som:

- **Unix-verktyg:** `sl`, `cowsay`, `moo`, `matrix`, `logo/ascii` (figlet),
  `weather`.
- **Skämtsvar:** `sudo` → "permission denied: nice try 😏", `coffee/brew` →
  HTTP 418 teapot, `rm -rf /` → "it's all in git", `git blame/commit/push`,
  `npm i` → fejkad resolve, `vim/emacs/nano` → editor-skämt, `:wq`/`:q` →
  "you can just type exit".
- **Ren lek:** `xyzzy` → "Nothing happens.", `42`/`answer`, `ping` → pong,
  `hello/hi/hey`, `konami` → party mode (↑↑↓↓←→←→ba, regnbågsläge), `fortune`.
- **Riktiga-ish statuskommandon:** `man`, `uname`, `colour`, `history`,
  `uptime`, `top`, `debug/env`, `reset`.

Portfolion håller `easteregg`-indexet utanför `help` med flit ("a discovery, not
a menu") — en bra upptäckbarhets­idé värd att behålla.

### Den centrala insikten
**pia har redan "tagit examen" på större delen av listan — men som riktiga
funktioner, inte skämt.** Det är skiljelinjen mot portfolion, där skämt är
charmlagret ovanpå en i grunden statisk sida:

- `sl`, `cowsay` (inkl. `moo`/super cow), `fortune`, `cmatrix`, `figlet` finns
  redan som **installerbara brew-paket** (egna pucker: `pkg-sl`, `pkg-fortune`,
  `pkg-cmatrix`, `pkg-figlet`).
- `sudo` **funkar på riktigt** (höjer rättigheter, skriver skyddade filer). Ett
  fejkat "permission denied: nice try" skulle *motsäga* maskinen.
- `nano` är en **riktig editor**; `man`, `ping`, `date`, `history`, `neofetch`
  är **riktiga kommandon**; `brew` är en **riktig pakethanterare** (så `coffee`
  får skämta, men `brew` får aldrig).

Slutsats: portfolions äggfilosofi krockar med pia:s principer. I pia är ett
fejkat `sudo`-avslag eller `rm -rf /`-skämt inte charmigt — det bryter
illusionen av en maskin som fungerar.

### Policy — tre hinkar
1. **Redan gjort — rör inte.** De klassiska verktygen är redan riktiga paket.
   pia:s modell (opt-in via `brew`, upptäckbar, ärlig) är *bättre* än portfolions
   dolda variant. Låt dem vara.
2. **Ta in som äkta terminaltradition.** Ägg som *är* Unix-folklore och inte
   ljuger om maskinen. Shortlist nedan.
3. **Avvisa — krockar med den riktiga maskinen.** Fejkat `sudo`-avslag, fejkat
   `rm -rf /`, fejkade `git`/`npm`-stubbar. Dessa kommandon gör (eller kan göra)
   något på riktigt i pia; en skämtstubbe motsäger det.

### Shortlist ur hink 2 (kandidater, ej beslut)
- `xyzzy` → "Nothing happens." — genuint bsdgames/Colossal Cave-idiom.
- `coffee` (alias, **ej** `brew`) → HTTP 418 "I'm a teapot".
- `vim`/`vi`/`emacs` → vänlig hänvisning "this is a nano machine — try `nano`"
  (idiomatiskt, bryter inget; `nano` finns på riktigt).
- ev. `42`/`answer` → the answer to life, the universe & everything.

## Öppna frågor
- **Upptäckbarhet:** kopiera portfolions dolda `easteregg`-index, eller låta
  äggen vara genuint odokumenterade? Ett `easteregg`-kommando är i sig lite
  o-Unix; kanske hellre `fortune`-stil (finns) eller ren tystnad.
- **`konami`/party mode:** ren web-divergens (visuellt regnbågsläge, ingen
  Unix-motsvarighet) — exakt sånt CLAUDE.md säger ska flaggas och synkas *innan*
  bygge. Eget beslut krävs innan det ens hamnar på shortlist.
- **`coffee` vs `brew`:** säkerställ att ett `coffee`-ägg aldrig råkar skugga
  eller förvirras med den riktiga `brew`-pakethanteraren.
- **Hink vs paket:** ska hink 2-äggen bo i kommandoregistret (`system.ts`) eller
  som ett litet opt-in `brew`-paket? Paket-vägen håller kärnan ren och är mer
  på-linje med hur pia redan behandlar `sl`/`cowsay`/`fortune`.
