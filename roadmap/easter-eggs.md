---
title: "påskägg: policy + shortlist"
status: done
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

### Policy — tre hinkar (beslutad)
1. **Redan gjort — rör inte.** De klassiska verktygen är redan riktiga paket.
   pia:s modell (opt-in via `brew`, upptäckbar, ärlig) är *bättre* än portfolions
   dolda variant. Låt dem vara.
2. **Ta in som äkta terminaltradition.** Ägg som *är* Unix-folklore och inte
   ljuger om maskinen. Levererat nedan.
3. **Avvisa — krockar med den riktiga maskinen.** Fejkat `sudo`-avslag, fejkat
   `rm -rf /`, fejkade `git`/`npm`-stubbar. Dessa kommandon gör (eller kan göra)
   något på riktigt i pia; en skämtstubbe motsäger det.

## Levererat (första omgången)
`src/commands/eggs.ts` — fem dolda kommandon, alla i hink 2:

- `xyzzy` → "Nothing happens." (bsdgames/Colossal Cave).
- `coffee` → HTTP 418 "I'm a teapot" (RFC 2324). **Eget kommando, aldrig alias
  på `brew`** — den riktiga pakethanteraren får inte skuggas.
- `vim`/`vi`/`emacs`/`pico` → "this machine ships `nano` — try that". Vänlig
  redirect för editor-muskelminne; `nano` finns på riktigt.
- `ed` → "ed is the standard text editor." (den äldsta editor-gaggen i Unix).
- `:q`/`:q!`/`:wq`/`:wq!`/`:x` → "you're at the shell — type `exit`". Fångar
  vi-quit-reflexen.

**Mekanik:** ny `hidden?`-flagga på `Command`. Dolda kommandon hålls utanför
`help`-listan *och* `namesStartingWith` (som driver både Tab-completion och
`man`/`apropos`-topiclistan), men är fortfarande körbara och nåbara via ett
explicit `man <namn>`/`help <namn>` om du redan kan namnet. Tester i
`eggs.test.ts` + rader i touren. `42`/`answer` ströks (Hitchhiker's, inte
*terminal*-idiom).

## Beslut på de tidigare öppna frågorna
- **Upptäckbarhet:** *inget* `easteregg`-index (o-Unix, själv-motsägande meny).
  Äggen är genuint odokumenterade; de självavslöjas genom naturlig användning
  (man skriver `vim`/`coffee` ändå) eller via kultur (`xyzzy`). `man <egg>` är
  belöningen för den redan invigde.
- **Var bo:** kärnregistret, inte ett `brew`-paket. Hink 2 är *reaktioner på
  något man ändå skriver* — magin är att de redan finns; en install-grind
  (`brew install eggs`) dödar poängen. Paket-mönstret är för *verktyg* (`sl`,
  `cowsay`, `fortune`), inte snubbla-på-reaktioner.
- **`coffee` vs `brew`:** löst — separat kommando, test som vaktar att `brew`
  fortfarande resolvar till pakethanteraren.

## Framtid (följer policyn ovan — ingen ny puck krävs)
- **`konami`/party mode:** parkerad. Ren web-divergens (visuellt läge, ingen
  Unix-motsvarighet) — hör hemma i *utseende*-arbetet (`crt-retro-mode` /
  `settings-appearance`, redan live), inte här. "Ett tema man låser upp med en
  kod", om det någonsin byggs.
- Fler hink 2-ägg kan läggas till i `eggs.ts` när de dyker upp, så länge de inte
  ljuger om maskinen.
