---
title: Rättigheter — skrivskyddat systemträd + sudo som escape-hatch
status: done
tags: [shell, fs, teaching]
updated: 2026-08-07
---

## Mål
Ge `sudo` (och på sikt `chmod`/`chown`) en *riktig referent*. PIA saknar
rättighetsmodell — allt är ditt — så `sudo` är idag bara persona. Idén: ett litet
skrivskyddat systemträd (`/etc`, `/bin`, `/usr`) som `sudo` kan öppna, så att
"elevera" faktiskt betyder något. Bygger också en pedagogisk yta (Unix-behörighet
att öva på) och knyter ihop befintliga features (boot-hälsning, neofetch).

## Upplägg i tre steg (var och en shippbar för sig)
1. **Seeda systemträdet** — filerna *finns* och *används*, ingen låsning. ✅ *(gjort)*
2. **Skrivskydda** systemsökvägarna — `rm /etc/motd` → `permission denied`. ✅ *(gjort)*
3. **`sudo`-elevation** — `sudo <cmd>` kör kommandot med skyddet av; escape-hatchen. ✅ *(gjort)*

## Levererat (steg 3, samma session)
`sudo <cmd>` kör nu payloaden **eleverat**: en motor-söm `ctx.exec(rad)` kör om
raden genom den riktiga pipeline-köraren (`runLine`→`runSequence`→`executePipeline`,
utextraherat ur `submit`), inuti `vfs.runElevated`. Så `sudo rm /etc/motd` /
`sudo nano /etc/hostname` funkar där ett vanligt kommando får `permission denied`.
- Ingen lösenords-/user-modell (single-user) — sudo är bara "jag menar det"-knappen.
- `ctx.fail()` (ny, tyst) låter sudo propagera payloadens exit-status till `&&`/`||`.
- **Nekar pipe/redirect, som på riktig Linux:** `>` och `|` görs av skalet runt
  det eleverade kommandot — payloaden körs om på en *ny rad*, så en redirect skulle
  skriva tomt (`sudo echo x > /etc/f` trunkerar filen) och en pipe skulle tappa
  sin input. Därför vägrar sudo i pipe/redirect (`ctx.piped || ctx.stdin`) och
  säger till dig att elevera själva skrivningen: `sudo nano /etc/hostname`.
- **Bevarar argument-gränser:** payloaden re-quotas innan den re-parsas, så
  `sudo touch "/etc/my file"` blir en fil, inte två.
- **Serialiserad över fönster:** elevation lyfter en *process-vid* vakt, så sudo
  tar tmux-övergångslåset (`otherWindowsBusy` → neka; annars `beginTransition`/
  `endTransition`) — bara ett eleverat kommando i taget, så inget annat fönster
  kan skriva /etc oskyddat medan `sudo nano` står öppet. `runElevated` räknar
  djup (inte en boolean), så överlappande async-elevationer inte korrumperar
  varandras vakt-tillstånd.
- Täckt av terminal-tester (sudo skriver i skyddat träd + återställer vakten;
  failure → `&&`; nekad i pipe/redirect utan att röra filen; quote-gränser
  bevarade; fönsterlåset tas/släpps) + vfs-test (överlappande async-elevation) +
  en tour-rad (`rm` nekad → `sudo rm` funkar).

## Levererat (steg 1, 2026-08-07)
`src/pia/etc.ts` (`seedSystemFiles`): en liten `/etc`, seedad idempotent vid boot
(global, inte per-home) i `main.ts` bredvid `seedDefaultPackages`.
- **`/etc/motd`** — message-of-the-day; boot-hälsningen läser den nu (`boot.ts`
  tar en `motd`-option, `DEFAULT_MOTD` som fallback). *Din* fil: seedas bara när
  den saknas (edits överlever), och self-healar om du raderar den.
- **`/etc/os-release`** — maskinägd OS-identitet (samma version som `neofetch`),
  skrivs alltid om till körande version så den inte driftar.
- **`/etc/hostname`** — maskinens namn bakom promptens `{host}` (läses via
  `terminalConfig` → `TerminalConfig.host`; default-prompten använder nu
  `{host}`). `echo laptop > /etc/hostname; source` döper om maskinen live.
- `ls /` visar nu `etc/  home/`. Täckt av `etc.test.ts` (seed/edit-överlevnad/
  self-heal/os-release-refresh/hostname) + tour-rader (`ls /`,
  `cat /etc/os-release`, `cat /etc/hostname`).

## Levererat (steg 2, samma session)
Skrivskydd i VFS:en, som planerat — prefix-baserat, ingen per-nod-metadata:
- `VFS.protectedPaths` (prefix) + en `elevated`-flagga och `runElevated(fn)`.
  Varje muterande op (`mkdir`/`mkdirp`/`touch`/`writeFile`/`remove`/`move`/`copy`)
  kollar `guardWrite(path)` och kastar `permission denied: <path>` om sökvägen
  ligger under ett skyddat prefix och vi inte är eleverade. `move`/`copy` vaktar
  *båda* ändarna (ut ur och in i /etc).
- `main.ts` sätter `vfs.protectedPaths = ["/etc"]`; `seedSystemFiles` kör i
  `runElevated` så systemet fortfarande kan seeda/uppdatera. Hemmet opåverkat.
- **Följd:** de "redigerbara" system­filerna (motd, hostname) är nu låsta för
  vanliga kommandon också — `echo laptop > /etc/hostname` ger `permission denied`.
  Det är meningen: seed-if-missing-designen betyder att när `sudo` (steg 3) finns,
  överlever dina eleverade edits en reseed. Tills dess är /etc helt låst.
- Täckt av vfs.test (neka alla ops / elevation-bypass), etc.test (seedar under
  skydd), commands.test (`rm /etc/motd` → denied, filen kvar), tour-rad.

## Kvar (steg 3)
- **Elevation (steg 3):** behöver en väg för `sudo` att *köra* payloaden med
  skyddet av. Antingen en motor-söm `ctx.exec(rad, { elevated })` (troget, kör om
  genom riktiga pipeline-köraren med glob/pipes/alias intakta) eller ett
  session-läge (`sudo -s` elevar tills `exit`). Söm-varianten är den faithful
  men dyrare biten.
- **Överlapp med `chmod`/`chown`:** när skydd finns är en simulerad rwx-modell
  (öva-på-behörighet) ett naturligt nästa steg (tidigare "alternativ D").

_Byggd steg 1 direkt den här sessionen; steg 2–3 medvetet uppskjutna. Följer
`roadmap/README.md`._
